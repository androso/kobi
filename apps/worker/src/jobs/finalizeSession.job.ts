import type { SupabaseClient } from "@supabase/supabase-js";
import type PgBoss from "pg-boss";
import {
  JOB_BUILD_LESSON_STATE,
  JOB_EVALUATE_CHECKPOINT,
  JOB_FINALIZE_SESSION,
} from "../queue.js";

export interface FinalizeSessionJobData {
  sessionId: string;
}

export interface FinalizeSessionJobResult {
  checkpointEnqueued: boolean;
  usedPartialContext: boolean;
}

class SessionFinalizationPendingError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "SessionFinalizationPendingError";
  }
}

/**
 * Owns the class-end guarantee. The browser only needs to enqueue this job;
 * retries wait for transcription and lesson-state progress before forcing one
 * final semantic checkpoint over the complete accumulated lesson context.
 */
export function registerFinalizeSessionJob(boss: PgBoss, supabase: SupabaseClient) {
  return boss.work<FinalizeSessionJobData>(
    JOB_FINALIZE_SESSION,
    { batchSize: 1, includeMetadata: true },
    async (jobs) => {
      const job = jobs[0];
      if (!job) return;
      return runFinalizeSessionJob(
        supabase,
        boss,
        job.data,
        job.retryCount,
        job.retryLimit,
      );
    },
  );
}

export async function runFinalizeSessionJob(
  supabase: SupabaseClient,
  boss: PgBoss,
  data: FinalizeSessionJobData,
  retryCount = 0,
  retryLimit = 0,
): Promise<FinalizeSessionJobResult> {
  const { sessionId } = data;
  const { data: chunks, error: chunksError } = await supabase
    .from("audio_chunks")
    .select("chunk_index,status")
    .eq("session_id", sessionId)
    .order("chunk_index", { ascending: true });

  if (chunksError) {
    throw new Error(`finalizeSession job: failed to load audio chunks: ${chunksError.message}`);
  }

  const unfinished = (chunks ?? []).filter(
    (chunk) => chunk.status !== "transcribed" && chunk.status !== "failed",
  );
  if (unfinished.length > 0) {
    throw new SessionFinalizationPendingError(
      `${unfinished.length} audio chunk(s) are still being transcribed`,
    );
  }

  const finalChunkIndex = (chunks ?? []).reduce<number | null>(
    (highest, chunk) =>
      typeof chunk.chunk_index === "number"
        ? Math.max(highest ?? -1, chunk.chunk_index)
        : highest,
    null,
  );
  const { data: progressSegment, error: progressError } = await supabase
    .from("segments")
    .select("source_through_chunk_index")
    .eq("session_id", sessionId)
    .not("source_through_chunk_index", "is", null)
    .order("source_through_chunk_index", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (progressError) {
    throw new Error(`finalizeSession job: failed to load lesson-state progress: ${progressError.message}`);
  }

  const progress =
    typeof progressSegment?.source_through_chunk_index === "number"
      ? progressSegment.source_through_chunk_index
      : null;
  const lessonStateBehind =
    finalChunkIndex !== null && (progress === null || progress < finalChunkIndex);

  if (lessonStateBehind) {
    await boss.send(
      JOB_BUILD_LESSON_STATE,
      { sessionId },
      { singletonKey: sessionId },
    );
    if (retryCount < retryLimit) {
      throw new SessionFinalizationPendingError(
        `lesson_state is at chunk ${progress ?? "none"} of ${finalChunkIndex}`,
      );
    }
    console.warn("[finalizeSession] retry budget exhausted; using partial lesson context", {
      sessionId,
      progress,
      finalChunkIndex,
    });
  }

  const checkpointJobId = await boss.send(
    JOB_EVALUATE_CHECKPOINT,
    { sessionId, trigger: "session_end", force: true },
    {
      singletonKey: `${sessionId}:final`,
      retryLimit: 3,
      retryDelay: 10,
      retryBackoff: true,
    },
  );

  console.info("[finalizeSession] final checkpoint enqueued", {
    sessionId,
    checkpointJobId,
    finalChunkIndex,
    lessonStateThroughChunkIndex: progress,
    usedPartialContext: lessonStateBehind,
  });
  return {
    checkpointEnqueued: true,
    usedPartialContext: lessonStateBehind,
  };
}
