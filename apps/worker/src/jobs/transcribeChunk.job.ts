import type { SupabaseClient } from "@supabase/supabase-js";
import { transcribeAudioChunk } from "@kobi/ai-core";
import type PgBoss from "pg-boss";
import { JOB_BUILD_LESSON_STATE } from "../queue.js";

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

      await supabase.from("audio_chunks").update({ status: "transcribing" }).eq("id", audioChunkId);

      const { transcriptText } = await transcribeAudioChunk({ audioUrl, mimeType });

      await supabase
        .from("audio_chunks")
        .update({ status: "transcribed", transcript_text: transcriptText })
        .eq("id", audioChunkId);

      await boss.send(JOB_BUILD_LESSON_STATE, { sessionId });
    },
  );
}
