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

export interface EvaluateCheckpointJobData {
  sessionId: string;
  /** TODO(Area D): pull these from the session's class record once that table exists. */
  grade?: number;
  subject?: string;
  unit?: string;
}

export type CheckpointEvaluator = (input: EvaluateCheckpointInput) => Promise<CheckpointDecision>;

export type CurriculumRetriever = (
  supabase: SupabaseClient,
  input: { queryText: string; grade: number; subject: string; unit?: string },
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
  curriculumFallback?: { grade: number; subject: string; unit?: string };
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
    { batchSize: 1 },
    async (jobs) => {
      const job = jobs[0];
      if (!job) return;

      await runEvaluateCheckpointJob(supabase, boss, job.data, {
        evaluator,
        curriculumRetriever: options.curriculumRetriever,
      });
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

  const since = await loadLastReadyCheckpointAt(supabase, sessionId);
  const lessonStates = await loadLessonStatesSince(supabase, sessionId, since);

  if (lessonStates.length === 0) {
    return { evaluated: false, ready: null, skippedReason: "no new segments since last checkpoint" };
  }

  const sessionContext = buildActivitySessionContext(lessonStates);
  const decision = await evaluator({ sessionContext, lessonStates });

  const { error: insertError } = await supabase.from("checkpoints").insert({
    session_id: sessionId,
    ready: decision.ready,
    reason: decision.reason,
    summary: decision.summary,
    session_context: sessionContext,
  });

  if (insertError) {
    throw new Error(`evaluateCheckpoint job: failed to insert checkpoint: ${insertError.message}`);
  }

  if (!decision.ready) {
    return { evaluated: true, ready: false, skippedReason: null };
  }

  const latestLessonState = lessonStates.at(-1)!;
  const queryText = buildCurriculumQueryText(latestLessonState);
  const retrievalContext = await resolveRetrievalContext(supabase, data);
  const curriculumMatches = await curriculumRetriever(supabase, {
    queryText,
    grade: retrievalContext.grade,
    subject: retrievalContext.subject,
    unit: retrievalContext.unit,
  });

  await boss.send(
    JOB_GENERATE_ACTIVITY_ARTIFACTS,
    buildGenerateActivityArtifactsJobData({
      sessionId,
      lessonState: latestLessonState,
      curriculumMatches,
      curriculumFallback: retrievalContext,
    }),
    { singletonKey: sessionId },
  );

  return { evaluated: true, ready: true, skippedReason: null };
}

async function resolveRetrievalContext(
  supabase: SupabaseClient,
  data: EvaluateCheckpointJobData,
): Promise<{ grade: number; subject: string; unit?: string }> {
  if (data.grade && data.subject) {
    return { grade: data.grade, subject: data.subject, unit: data.unit };
  }

  const { data: row, error } = await supabase
    .from("sessions")
    .select("classes(grade, subject, unit)")
    .eq("id", data.sessionId)
    .maybeSingle();

  if (error) {
    throw new Error(`evaluateCheckpoint job: failed to load session class context: ${error.message}`);
  }

  const classContext = normalizeClassContext(row?.classes);
  return {
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
