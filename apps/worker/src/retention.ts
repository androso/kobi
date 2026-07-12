import type { SupabaseClient } from "@supabase/supabase-js";
import { classifySafeError, safeLog } from "@kobi/ai-core";

export const retentionDays = {
  rawAudio: readDays("RAW_AUDIO_RETENTION_DAYS", 7),
  rawTranscript: readDays("RAW_TRANSCRIPT_RETENTION_DAYS", 14),
  lessonStateSummary: readDays("LESSON_STATE_RETENTION_DAYS", 90),
  aggregateReports: readDays("AGGREGATE_REPORT_RETENTION_DAYS", 365),
};

const AUDIO_BUCKET = process.env.AUDIO_BUCKET ?? "audio-chunks";

function readDays(name: string, fallback: number): number {
  const value = Number(process.env[name] ?? fallback);
  if (!Number.isInteger(value) || value < 1) throw new Error(`${name} must be a positive integer`);
  return value;
}

function cutoff(days: number): string {
  return new Date(Date.now() - days * 86_400_000).toISOString();
}

export interface RetentionResult { audioDeleted: number; transcriptsCleared: number; summariesDeleted: number; }

export async function runRetentionCleanup(
  supabase: SupabaseClient,
  options: { sessionId?: string; reason?: "scheduled" | "manual" } = {},
): Promise<RetentionResult> {
  const reason = options.reason ?? "scheduled";
  const result: RetentionResult = { audioDeleted: 0, transcriptsCleared: 0, summariesDeleted: 0 };
  const { data: attempt, error: attemptError } = await supabase
    .from("retention_deletion_attempts")
    .insert({ session_id: options.sessionId ?? null, reason, status: "running" })
    .select("id")
    .single();
  if (attemptError) throw new Error(`retention attempt could not be recorded: ${attemptError.message}`);

  try {
    let audioQuery = supabase.from("audio_chunks").select("id, storage_path");
    audioQuery = options.sessionId
      ? audioQuery.eq("session_id", options.sessionId)
      : audioQuery.lt("created_at", cutoff(retentionDays.rawAudio));
    const { data: audioRows, error: audioReadError } = await audioQuery;
    if (audioReadError) throw new Error(`retention audio lookup failed: ${audioReadError.message}`);

    const storagePaths = (audioRows ?? []).map((row) => row.storage_path).filter(Boolean);
    if (storagePaths.length > 0) {
      const { error } = await supabase.storage.from(AUDIO_BUCKET).remove(storagePaths);
      if (error) throw new Error(`retention storage deletion failed: ${error.message}`);
      result.audioDeleted = storagePaths.length;
      const { error: pathError } = await supabase
        .from("audio_chunks")
        .update({ storage_path: "deleted" })
        .in("id", audioRows!.map((r) => r.id));
      if (pathError) throw new Error(`retention storage path cleanup failed: ${pathError.message}`);
    }

    let transcriptQuery = supabase.from("audio_chunks").update({ transcript_text: null });
    transcriptQuery = options.sessionId
      ? transcriptQuery.eq("session_id", options.sessionId)
      : transcriptQuery.lt("created_at", cutoff(retentionDays.rawTranscript)).not("transcript_text", "is", null);
    const { data: cleared, error: transcriptError } = await transcriptQuery.select("id");
    if (transcriptError) throw new Error(`retention transcript cleanup failed: ${transcriptError.message}`);
    result.transcriptsCleared = cleared?.length ?? 0;

    let summaryQuery = supabase.from("segments").delete();
    summaryQuery = options.sessionId
      ? summaryQuery.eq("session_id", options.sessionId)
      : summaryQuery.lt("created_at", cutoff(retentionDays.lessonStateSummary));
    const { data: summaries, error: summaryError } = await summaryQuery.select("id");
    if (summaryError) throw new Error(`retention summary cleanup failed: ${summaryError.message}`);
    result.summariesDeleted = summaries?.length ?? 0;

    const { error: completionError } = await supabase
      .from("retention_deletion_attempts")
      .update({ status: "completed", completed_at: new Date().toISOString(), result })
      .eq("id", attempt.id);
    if (completionError) throw new Error(`retention completion could not be recorded: ${completionError.message}`);
    safeLog("info", "retention.completed", { reason, ...result });
    return result;
  } catch (error) {
    const category = classifySafeError(error);
    await supabase.from("retention_deletion_attempts").update({ status: "failed", error_category: category, completed_at: new Date().toISOString() }).eq("id", attempt.id);
    safeLog("error", "retention.failed", { reason, outcome: category });
    throw error;
  }
}
