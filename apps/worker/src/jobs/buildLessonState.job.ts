import type { SupabaseClient } from "@supabase/supabase-js";
import {
  buildLessonState,
  type LessonClassContext,
  type LessonState,
} from "@kobi/ai-core";
import type PgBoss from "pg-boss";
import { JOB_BUILD_LESSON_STATE } from "../queue.js";

export interface BuildLessonStateJobData {
  sessionId: string;
}

interface ClaimedRange {
  claim_id: string;
  from_chunk_index: number;
  to_chunk_index: number;
  transcript_text: string;
  previous_lesson_state: LessonState | null;
  grade: number;
  subject: string;
  unit: string;
  locale: "es-SV";
}

type LessonStateBuilder = typeof buildLessonState;

/**
 * Claims the next contiguous range under a per-session database lock. The
 * durable claim makes retries idempotent; finalization inserts one segment and
 * consumes the claim atomically.
 */
export async function processBuildLessonStateJob(
  supabase: SupabaseClient,
  sessionId: string,
  builder: LessonStateBuilder = buildLessonState,
): Promise<"processed" | "waiting" | "silent" | "stale"> {
  const { data, error } = await supabase.rpc("claim_next_lesson_state_range", {
    target_session_id: sessionId,
    max_chunks: 2,
  });
  if (error) {
    throw new Error(`buildLessonState job: failed to claim chunks: ${error.message}`);
  }

  const claim = normalizeClaim(Array.isArray(data) ? data[0] : null);
  if (!claim) return "waiting";

  const transcriptText = claim.transcript_text.trim();
  if (!transcriptText) {
    // Silence advances the durable source cursor without creating a newer
    // lesson_state that would hide the last meaningful teaching context.
    const finalized = await finalizeClaim(supabase, claim, null);
    return finalized ? "silent" : "stale";
  }

  const classContext: LessonClassContext = {
    grade: claim.grade,
    subject: claim.subject,
    unit: claim.unit,
    locale: claim.locale,
  };
  const lessonState = await builder({
    transcriptText,
    previousLessonState: claim.previous_lesson_state,
    classContext,
  });

  return (await finalizeClaim(supabase, claim, lessonState)) ? "processed" : "stale";
}

export function registerBuildLessonStateJob(boss: PgBoss, supabase: SupabaseClient) {
  return boss.work<BuildLessonStateJobData>(
    "build-lesson-state",
    { batchSize: 1 },
    async (jobs) => {
      const job = jobs[0];
      if (!job) return;
      const result = await processBuildLessonStateJob(supabase, job.data.sessionId);
      if (result === "stale") {
        // Another worker finalized this claim while this job was building it.
        // Requeue so this consumed job does not strand the next transcribed range.
        await boss.send(JOB_BUILD_LESSON_STATE, { sessionId: job.data.sessionId });
      }
    },
  );
}

async function finalizeClaim(
  supabase: SupabaseClient,
  claim: ClaimedRange,
  lessonState: LessonState | null,
): Promise<boolean> {
  const { data, error } = await supabase.rpc("finalize_lesson_state_range", {
    target_claim_id: claim.claim_id,
    new_lesson_state: lessonState,
    new_confidence: lessonState?.confidence ?? 0,
    new_transcript_summary: lessonState?.transcript_summary ?? "",
  });
  if (error) {
    throw new Error(`buildLessonState job: failed to finalize chunks: ${error.message}`);
  }
  return data === true;
}

function normalizeClaim(value: unknown): ClaimedRange | null {
  if (!value || typeof value !== "object") return null;
  const row = value as Record<string, unknown>;
  if (
    typeof row.claim_id !== "string" ||
    !Number.isInteger(row.from_chunk_index) ||
    !Number.isInteger(row.to_chunk_index) ||
    typeof row.transcript_text !== "string" ||
    !Number.isInteger(row.grade) ||
    typeof row.subject !== "string" ||
    typeof row.unit !== "string" ||
    row.locale !== "es-SV"
  ) {
    throw new Error("buildLessonState job: claim returned missing or invalid class/range context");
  }
  return row as unknown as ClaimedRange;
}
