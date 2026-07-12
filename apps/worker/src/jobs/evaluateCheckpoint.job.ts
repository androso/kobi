import type { SupabaseClient } from "@supabase/supabase-js";
import { lessonStateSchema, type LessonState } from "@kobi/ai-core";
import { buildActivitySessionContext } from "@kobi/activities/server";
import type { CurriculumMatch } from "@kobi/curriculum";
import type PgBoss from "pg-boss";
import {
  createCheckpointEvaluatorFromEnv,
  type CheckpointDecision,
  type EvaluateCheckpointInput,
} from "../checkpoint/evaluateCheckpoint.js";

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
  checkpointId?: string;
  sessionId?: string;
  lessonState?: LessonState;
  curriculumMatches?: CurriculumMatch[];
}) {
  if (input.checkpointId) return { checkpointId: input.checkpointId };
  return { sessionId: input.sessionId, lessonState: input.lessonState, curriculumMatches: input.curriculumMatches };
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
  const { sessionId } = data;

  const since = await loadLastReadyCheckpointAt(supabase, sessionId);
  const segments = await loadLessonStatesSince(supabase, sessionId, since);
  const lessonStates = segments.map((segment) => segment.lessonState);

  if (lessonStates.length === 0) {
    return { evaluated: false, ready: null, skippedReason: "no new segments since last checkpoint" };
  }

  const sessionContext = buildActivitySessionContext(lessonStates);
  const decision = await evaluator({ sessionContext, lessonStates });

  if (decision.ready) {
    const latestLessonState = lessonStates.at(-1)!;
    const { error } = await supabase.rpc("persist_ready_checkpoint_with_outbox", {
      p_session_id: sessionId,
      p_reason: decision.reason,
      p_summary: decision.summary,
      p_session_context: sessionContext,
      p_segment_ids: segments.map((segment) => segment.id),
      p_latest_lesson_state: latestLessonState,
    });
    if (error) throw new Error(`evaluateCheckpoint job: failed to persist ready checkpoint and outbox: ${error.message}`);
    return { evaluated: true, ready: true, skippedReason: null };
  }

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

  return { evaluated: true, ready: false, skippedReason: null };
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
): Promise<Array<{ id: string; lessonState: LessonState }>> {
  let query = supabase
    .from("segments")
    .select("id, lesson_state")
    .eq("session_id", sessionId)
    .order("created_at", { ascending: true });

  if (since) {
    query = query.gt("created_at", since);
  }

  const { data, error } = await query;

  if (error) {
    throw new Error(`evaluateCheckpoint job: failed to load segments: ${error.message}`);
  }

  return (data ?? []).flatMap((row, index) => {
    const result = lessonStateSchema.safeParse(row.lesson_state);
    return result.success ? [{ id: String(row.id ?? `segment-${index}`), lessonState: result.data }] : [];
  });
}
