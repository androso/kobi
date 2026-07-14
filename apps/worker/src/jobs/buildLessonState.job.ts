import type { SupabaseClient } from "@supabase/supabase-js";
import { buildLessonState, type LessonState } from "@kobi/ai-core";
import type PgBoss from "pg-boss";

export interface BuildLessonStateJobData {
  sessionId: string;
  /** TODO(Area D): pull these from the session's class record once that table exists. */
  grade?: number;
  subject?: string;
  unit?: string;
}

/**
 * On 1-2 newly transcribed chunks: build the rolling lesson_state and persist
 * it as a segments row. This job no longer decides when to move to the
 * Propose stage — that decision now lives in the checkpoint gate
 * (checkpointScheduler.job.ts + evaluateCheckpoint.job.ts), which runs on its
 * own timer independent of this per-chunk cadence and reads accumulated
 * segments directly.
 *
 * TODO(Area D/Realtime): push the new lesson_state to the teacher UI via
 * Supabase Realtime once apps/web subscribes to it.
 */
export function registerBuildLessonStateJob(boss: PgBoss, supabase: SupabaseClient) {
  return boss.work<BuildLessonStateJobData>(
    "build-lesson-state",
    { batchSize: 1 },
    async (jobs) => {
      const job = jobs[0];
      if (!job) return;

      const { sessionId } = job.data;

      const { data: chunks, error: chunksError } = await supabase
        .from("audio_chunks")
        .select("transcript_text")
        .eq("session_id", sessionId)
        .eq("status", "transcribed")
        .order("chunk_index", { ascending: false })
        .limit(2);

      if (chunksError) {
        throw new Error(`buildLessonState job: failed to load chunks: ${chunksError.message}`);
      }

      const transcriptText = (chunks ?? [])
        .map((chunk) => chunk.transcript_text)
        .filter(Boolean)
        .reverse()
        .join("\n");

      if (!transcriptText) return;

      const { data: previousSegment, error: previousSegmentError } = await supabase
        .from("segments")
        .select("lesson_state")
        .eq("session_id", sessionId)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      if (previousSegmentError) {
        throw new Error(
          `buildLessonState job: failed to load previous segment: ${previousSegmentError.message}`,
        );
      }

      const lessonState: LessonState = await buildLessonState({
        transcriptText,
        previousLessonState: (previousSegment?.lesson_state as LessonState) ?? null,
      });

      const { error: segmentError } = await supabase.from("segments").insert({
        session_id: sessionId,
        lesson_state: lessonState,
        confidence: lessonState.confidence,
        transcript_summary: lessonState.transcript_summary,
      });

      if (segmentError) {
        throw new Error(`buildLessonState job: failed to insert segment: ${segmentError.message}`);
      }
    },
  );
}
