import type { SupabaseClient } from "@supabase/supabase-js";
import { lessonStateSchema, type LessonState } from "@kobi/ai-core";
import { buildActivitySessionContext } from "@kobi/activities/server";
import {
  buildCurriculumQueryText,
  retrieveCurriculumMatches,
  type CurriculumMatch,
} from "@kobi/curriculum";
import type PgBoss from "pg-boss";
import {
  createCheckpointEvaluatorFromEnv,
  type CheckpointDecision,
  type EvaluateCheckpointInput,
} from "../checkpoint/evaluateCheckpoint.js";
import { JOB_GENERATE_ACTIVITY_ARTIFACTS } from "../queue.js";
import { loadSelectedCurriculumSourceIds } from "../curriculumSelections.js";

export interface EvaluateCheckpointJobData {
  sessionId: string;
  trigger?: "context" | "timer" | "session_end";
  /** Session-end checkpoints reconsider the full lesson, even after an earlier ready checkpoint. */
  force?: boolean;
  /** TODO(Area D): pull these from the session's class record once that table exists. */
  grade?: number;
  subject?: string;
  unit?: string;
}

export type CheckpointEvaluator = (input: EvaluateCheckpointInput) => Promise<CheckpointDecision>;

export type CurriculumRetriever = (
  supabase: SupabaseClient,
  input: { queryText: string; grade: number; subject: string; unit?: string; sourceIds?: string[] },
) => Promise<CurriculumMatch[]>;

export interface EvaluateCheckpointJobOptions {
  evaluator?: CheckpointEvaluator;
  curriculumRetriever?: CurriculumRetriever;
}

export interface EvaluateCheckpointJobResult {
  evaluated: boolean;
  ready: boolean | null;
  skippedReason: string | null;
}

export function buildGenerateActivityArtifactsJobData(input: {
  sessionId: string;
  lessonState: LessonState;
  curriculumMatches: CurriculumMatch[];
  curriculumFallback?: {
    classId?: string;
    grade: number;
    subject: string;
    unit?: string;
    sourceIds?: string[];
  };
}) {
  return {
    sessionId: input.sessionId,
    lessonState: input.lessonState,
    curriculumMatches: input.curriculumMatches,
    ...(input.curriculumFallback ? { curriculumFallback: input.curriculumFallback } : {}),
  };
}

/**
 * The checkpoint gate: runs on its own schedule (see checkpointScheduler.job.ts),
 * independent from build-lesson-state's per-chunk cadence. Looks at everything
 * accumulated since the last `ready` checkpoint and asks the checkpoint agent
 * (OpenAI, see ../checkpoint/evaluateCheckpoint.ts) whether it's enough to move
 * to the Propose stage. Replaces the old static `confidence >= 0.5` gate that
 * used to live inline in buildLessonState.job.ts.
 */
export function registerEvaluateCheckpointJob(
  boss: PgBoss,
  supabase: SupabaseClient,
  options: EvaluateCheckpointJobOptions = {},
) {
  const evaluator = options.evaluator ?? createCheckpointEvaluatorFromEnv();

  return boss.work<EvaluateCheckpointJobData>(
    "evaluate-checkpoint",
    { batchSize: 1, includeMetadata: true },
    async (jobs) => {
      const job = jobs[0];
      if (!job) return;

      const startedAt = Date.now();
      console.info("[evaluateCheckpoint] job started", {
        sessionId: job.data.sessionId,
        jobId: job.id,
        trigger: job.data.trigger ?? "timer",
        force: Boolean(job.data.force),
        retryCount: job.retryCount,
        retryLimit: job.retryLimit,
      });
      try {
        const result = await runEvaluateCheckpointJob(supabase, boss, job.data, {
          evaluator,
          curriculumRetriever: options.curriculumRetriever,
        });
        console.info("[evaluateCheckpoint] job finished", {
          sessionId: job.data.sessionId,
          jobId: job.id,
          durationMs: Date.now() - startedAt,
          ...result,
        });
        return result;
      } catch (error) {
        console.error("[evaluateCheckpoint] job failed", {
          sessionId: job.data.sessionId,
          jobId: job.id,
          trigger: job.data.trigger ?? "timer",
          force: Boolean(job.data.force),
          retryCount: job.retryCount,
          retryLimit: job.retryLimit,
          durationMs: Date.now() - startedAt,
          error: error instanceof Error ? error.stack ?? error.message : error,
        });
        throw error;
      }
    },
  );
}

export async function runEvaluateCheckpointJob(
  supabase: SupabaseClient,
  boss: PgBoss,
  data: EvaluateCheckpointJobData,
  options: EvaluateCheckpointJobOptions = {},
): Promise<EvaluateCheckpointJobResult> {
  const evaluator = options.evaluator ?? createCheckpointEvaluatorFromEnv();
  const curriculumRetriever = options.curriculumRetriever ?? retrieveCurriculumMatches;
  const { sessionId } = data;

  const since = data.force ? null : await loadLastReadyCheckpointAt(supabase, sessionId);
  const lessonStates = await loadLessonStatesSince(supabase, sessionId, since);

  if (lessonStates.length === 0) {
    return { evaluated: false, ready: null, skippedReason: "no new segments since last checkpoint" };
  }

  const sessionContext = buildActivitySessionContext(lessonStates);
  const decision = await evaluator({ sessionContext, lessonStates });

  console.info("[evaluateCheckpoint] semantic decision", {
    sessionId,
    trigger: data.trigger ?? "timer",
    force: Boolean(data.force),
    segmentCount: lessonStates.length,
    ready: decision.ready,
    reason: decision.reason,
  });

  const checkpoint = {
    session_id: sessionId,
    ready: decision.ready,
    reason: decision.reason,
    summary: decision.summary,
    session_context: sessionContext,
  };

  if (!decision.ready) {
    await insertCheckpoint(supabase, checkpoint);
    return { evaluated: true, ready: false, skippedReason: null };
  }

  const latestLessonState = lessonStates.at(-1)!;
  const queryText = buildCurriculumQueryText(latestLessonState);
  const retrievalContext = await resolveRetrievalContext(supabase, data);
  const sourceIds = await loadSelectedCurriculumSourceIds(supabase, retrievalContext.classId);
  const curriculumMatches = await curriculumRetriever(supabase, {
    queryText,
    grade: retrievalContext.grade,
    subject: retrievalContext.subject,
    unit: retrievalContext.unit,
    sourceIds,
  });

  const generationJobId = await boss.send(
    JOB_GENERATE_ACTIVITY_ARTIFACTS,
    buildGenerateActivityArtifactsJobData({
      sessionId,
      lessonState: latestLessonState,
      curriculumMatches,
      curriculumFallback: { ...retrievalContext, sourceIds },
    }),
    {
      singletonKey: sessionId,
      retryLimit: 2,
      retryDelay: 15,
      retryBackoff: true,
    },
  );

  // Persist a ready checkpoint only after generation has been handed to the
  // queue. Otherwise a transient retrieval/send failure makes the retry see
  // "no new segments" and permanently loses generation for the lesson.
  await insertCheckpoint(supabase, checkpoint);
  console.info("[evaluateCheckpoint] generation enqueued", {
    sessionId,
    generationJobId,
    curriculumMatchCount: curriculumMatches.length,
  });

  return { evaluated: true, ready: true, skippedReason: null };
}

async function insertCheckpoint(
  supabase: SupabaseClient,
  checkpoint: {
    session_id: string;
    ready: boolean;
    reason: string;
    summary: string;
    session_context: ReturnType<typeof buildActivitySessionContext>;
  },
) {
  const { error } = await supabase.from("checkpoints").insert(checkpoint);
  if (error) {
    throw new Error(`evaluateCheckpoint job: failed to insert checkpoint: ${error.message}`);
  }
}

async function resolveRetrievalContext(
  supabase: SupabaseClient,
  data: EvaluateCheckpointJobData,
): Promise<{ classId?: string; grade: number; subject: string; unit?: string }> {
  if (data.grade && data.subject) {
    return { grade: data.grade, subject: data.subject, unit: data.unit };
  }

  const { data: row, error } = await supabase
    .from("sessions")
    .select("class_id, classes(grade, subject, unit)")
    .eq("id", data.sessionId)
    .maybeSingle();

  if (error) {
    throw new Error(`evaluateCheckpoint job: failed to load session class context: ${error.message}`);
  }

  const classContext = normalizeClassContext(row?.classes);
  return {
    classId: typeof row?.class_id === "string" ? row.class_id : undefined,
    grade: data.grade ?? classContext?.grade ?? 7,
    subject: data.subject ?? classContext?.subject ?? "lenguaje",
    unit: data.unit ?? classContext?.unit,
  };
}

function normalizeClassContext(value: unknown): { grade: number; subject: string; unit: string } | null {
  const raw = Array.isArray(value) ? value[0] : value;
  if (!raw || typeof raw !== "object") return null;

  const row = raw as Record<string, unknown>;
  const grade = Number(row.grade);
  const subject = typeof row.subject === "string" ? row.subject : "";
  const unit = typeof row.unit === "string" ? row.unit : "";

  if (!Number.isInteger(grade) || grade <= 0 || !subject) return null;
  return { grade, subject, unit };
}

async function loadLastReadyCheckpointAt(
  supabase: SupabaseClient,
  sessionId: string,
): Promise<string | null> {
  const { data, error } = await supabase
    .from("checkpoints")
    .select("created_at")
    .eq("session_id", sessionId)
    .eq("ready", true)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) {
    throw new Error(`evaluateCheckpoint job: failed to load last ready checkpoint: ${error.message}`);
  }

  return data?.created_at ?? null;
}

async function loadLessonStatesSince(
  supabase: SupabaseClient,
  sessionId: string,
  since: string | null,
): Promise<LessonState[]> {
  let query = supabase
    .from("segments")
    .select("lesson_state")
    .eq("session_id", sessionId)
    .order("created_at", { ascending: true });

  if (since) {
    query = query.gt("created_at", since);
  }

  const { data, error } = await query;

  if (error) {
    throw new Error(`evaluateCheckpoint job: failed to load segments: ${error.message}`);
  }

  return (data ?? [])
    .map((row) => lessonStateSchema.safeParse(row.lesson_state))
    .filter((result) => result.success)
    .map((result) => result.data);
}
