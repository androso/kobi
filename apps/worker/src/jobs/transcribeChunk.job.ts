import type { SupabaseClient } from "@supabase/supabase-js";
import { classifySafeError, safeLog, transcribeAudioChunk } from "@kobi/ai-core";
import type PgBoss from "pg-boss";
import { JOB_BUILD_LESSON_STATE } from "../queue.js";
import { isSessionDeletionRequested } from "../retention.js";

export interface TranscribeChunkJobData {
  audioChunkId: string;
  audioUrl: string;
  mimeType: string;
  sessionId: string;
}

/**
 * On a new audio_chunks row: transcribe it, store the text, and enqueue the
 * lesson-state build. Runs immediately after each chunk lands (per the
 * "transcription job: immediately after each chunk" cadence note).
 */
export function registerTranscribeChunkJob(boss: PgBoss, supabase: SupabaseClient) {
  return boss.work<TranscribeChunkJobData>(
    "transcribe-chunk",
    { batchSize: 1 },
    async (jobs) => {
      const job = jobs[0];
      if (!job) return;

      const { audioChunkId, audioUrl, mimeType, sessionId } = job.data;

      if (await isSessionDeletionRequested(supabase, sessionId)) return;

      safeLog("info", "transcription.chunk_picked_up", { audioChunkId, sessionId });

      const { error: statusError } = await supabase
        .from("audio_chunks")
        .update({ status: "transcribing" })
        .eq("id", audioChunkId);

      if (statusError) {
        throw new Error(`transcribeChunk job: failed to mark chunk transcribing: ${statusError.message}`);
      }

      let transcriptText: string;
      try {
        const result = await transcribeAudioChunk({ audioUrl, mimeType });
        transcriptText = result.transcriptText;
      } catch (error) {
        safeLog("error", "transcription.chunk_failed", { audioChunkId, sessionId, outcome: classifySafeError(error) });

        const { error: failedStatusError } = await supabase
          .from("audio_chunks")
          .update({ status: "failed" })
          .eq("id", audioChunkId);

        if (failedStatusError) {
          throw new Error(
            `transcribeChunk job: transcription failed and failed status could not be saved: ${failedStatusError.message}`,
            { cause: error },
          );
        }

        throw error;
      }

      if (!transcriptText) {
        safeLog("warn", "transcription.chunk_empty", { audioChunkId, sessionId });
      }

      if (await isSessionDeletionRequested(supabase, sessionId)) {
        await supabase.from("audio_chunks").update({ status: "failed" }).eq("id", audioChunkId);
        return;
      }

      const { error: updateError } = await supabase
        .from("audio_chunks")
        .update({ status: "transcribed", transcript_text: transcriptText })
        .eq("id", audioChunkId);

      if (updateError) {
        throw new Error(`transcribeChunk job: failed to save transcript: ${updateError.message}`);
      }

      safeLog("info", "transcription.chunk_saved", { audioChunkId, sessionId, transcriptBytes: Buffer.byteLength(transcriptText, "utf8") });

      await boss.send(JOB_BUILD_LESSON_STATE, { sessionId });
    },
  );
}
