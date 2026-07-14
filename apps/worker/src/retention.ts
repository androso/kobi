import type { SupabaseClient } from "@supabase/supabase-js";
import { classifySafeError, safeLog } from "@kobi/ai-core";

export interface RetentionConfig {
  rawAudio: number;
  rawTranscript: number;
  lessonStateSummary: number;
  aggregateReports: number;
  audioBucket: string;
}

export function readRetentionConfig(env: NodeJS.ProcessEnv = process.env): RetentionConfig {
  return {
    rawAudio: readDays(env, "RAW_AUDIO_RETENTION_DAYS", 7),
    rawTranscript: readDays(env, "RAW_TRANSCRIPT_RETENTION_DAYS", 14),
    lessonStateSummary: readDays(env, "LESSON_STATE_RETENTION_DAYS", 90),
    aggregateReports: readDays(env, "AGGREGATE_REPORT_RETENTION_DAYS", 365),
    audioBucket: env.AUDIO_BUCKET ?? "audio-chunks",
  };
}

function readDays(env: NodeJS.ProcessEnv, name: string, fallback: number): number {
  const value = Number(env[name] ?? fallback);
  if (!Number.isInteger(value) || value < 1) throw new Error(`${name} must be a positive integer`);
  return value;
}

function cutoff(days: number): string {
  return new Date(Date.now() - days * 86_400_000).toISOString();
}

export interface RetentionResult {
  audioDeleted: number;
  transcriptsCleared: number;
  summariesDeleted: number;
  checkpointsDeleted: number;
  candidateContextsRedacted: number;
  audioCleanupFailed: boolean;
  quiesceTimedOut: boolean;
}

export async function isSessionDeletionRequested(
  supabase: SupabaseClient,
  sessionId: string,
): Promise<boolean> {
  const { data, error } = await supabase
    .from("sessions")
    .select("classroom_data_deletion_requested_at")
    .eq("id", sessionId)
    .maybeSingle();

  if (error) throw new Error(`retention session lookup failed: ${error.message}`);
  return Boolean(data?.classroom_data_deletion_requested_at);
}

export async function requestSessionDataDeletion(
  supabase: SupabaseClient,
  sessionId: string,
): Promise<void> {
  const { data, error } = await supabase
    .from("sessions")
    .update({ classroom_data_deletion_requested_at: new Date().toISOString() })
    .eq("id", sessionId)
    .select("id")
    .maybeSingle();

  if (error) throw new Error(`retention session deletion marker failed: ${error.message}`);
  if (!data) throw new Error(`retention session not found: ${sessionId}`);
}

export async function quiesceSessionJobs(
  supabase: SupabaseClient,
  sessionId: string,
  options: { timeoutMs?: number; pollMs?: number } = {},
): Promise<boolean> {
  const timeoutMs = options.timeoutMs ?? 10_000;
  const pollMs = options.pollMs ?? 100;
  const deadline = Date.now() + timeoutMs;

  const { error: cancelError } = await supabase
    .from("audio_chunks")
    .update({ status: "failed" })
    .eq("session_id", sessionId)
    .eq("status", "pending");
  if (cancelError) throw new Error(`retention pending job cancellation failed: ${cancelError.message}`);

  while (true) {
    const { data, error } = await supabase
      .from("audio_chunks")
      .select("id")
      .eq("session_id", sessionId)
      .eq("status", "transcribing");
    if (error) throw new Error(`retention active job lookup failed: ${error.message}`);
    if ((data ?? []).length === 0) return true;
    if (Date.now() >= deadline) return false;
    await new Promise((resolve) => setTimeout(resolve, pollMs));
  }
}

const REDACTED_SESSION_CONTEXT = {
  latest_topic: "[redacted]",
  latest_objective: null,
  vocabulary: [],
  examples_used: [],
  misconceptions: [],
  time_remaining_minutes: null,
  confidence: 0,
  segment_count: 0,
};

export async function runRetentionCleanup(
  supabase: SupabaseClient,
  options: {
    sessionId?: string;
    reason?: "scheduled" | "manual";
    quiesce?: { timeoutMs?: number; pollMs?: number };
  } = {},
): Promise<RetentionResult> {
  const reason = options.reason ?? "scheduled";
  const config = readRetentionConfig();
  const result: RetentionResult = {
    audioDeleted: 0,
    transcriptsCleared: 0,
    summariesDeleted: 0,
    checkpointsDeleted: 0,
    candidateContextsRedacted: 0,
    audioCleanupFailed: false,
    quiesceTimedOut: false,
  };
  const { data: attempt, error: attemptError } = await supabase
    .from("retention_deletion_attempts")
    .insert({ session_id: options.sessionId ?? null, reason, status: "running" })
    .select("id")
    .single();
  if (attemptError) throw new Error(`retention attempt could not be recorded: ${attemptError.message}`);

  try {
    if (reason === "manual" && options.sessionId) {
      await requestSessionDataDeletion(supabase, options.sessionId);
      result.quiesceTimedOut = !(await quiesceSessionJobs(supabase, options.sessionId, options.quiesce));
    }

    const candidateSourceSessionIds = options.sessionId
      ? null
      : await loadExpiredCandidateSourceSessionIds(supabase, cutoff(config.lessonStateSummary));

    try {
      let audioQuery = supabase.from("audio_chunks").select("id, storage_path");
      audioQuery = options.sessionId
        ? audioQuery.eq("session_id", options.sessionId)
        : audioQuery.lt("created_at", cutoff(config.rawAudio));
      const { data: audioRows, error: audioReadError } = await audioQuery;
      if (audioReadError) throw new Error(`retention audio lookup failed: ${audioReadError.message}`);

      const storagePaths = (audioRows ?? []).map((row) => row.storage_path).filter(Boolean);
      if (storagePaths.length > 0) {
        const { error } = await supabase.storage.from(config.audioBucket).remove(storagePaths);
        if (error) throw new Error(`retention storage deletion failed: ${error.message}`);
        result.audioDeleted = storagePaths.length;
        const { error: pathError } = await supabase
          .from("audio_chunks")
          .update({ storage_path: "deleted" })
          .in("id", (audioRows ?? []).map((row) => row.id));
        if (pathError) throw new Error(`retention storage path cleanup failed: ${pathError.message}`);
      }
    } catch (error) {
      result.audioCleanupFailed = true;
      safeLog("error", "retention.audio_failed", { reason, outcome: classifySafeError(error) });
    }

    let transcriptQuery = supabase.from("audio_chunks").update({ transcript_text: null });
    transcriptQuery = options.sessionId
      ? transcriptQuery.eq("session_id", options.sessionId)
      : transcriptQuery.lt("created_at", cutoff(config.rawTranscript)).not("transcript_text", "is", null);
    const { data: cleared, error: transcriptError } = await transcriptQuery.select("id");
    if (transcriptError) throw new Error(`retention transcript cleanup failed: ${transcriptError.message}`);
    result.transcriptsCleared = cleared?.length ?? 0;

    let summaryQuery = supabase.from("segments").delete();
    summaryQuery = options.sessionId
      ? summaryQuery.eq("session_id", options.sessionId)
      : summaryQuery.lt("created_at", cutoff(config.lessonStateSummary));
    const { data: summaries, error: summaryError } = await summaryQuery.select("id");
    if (summaryError) throw new Error(`retention summary cleanup failed: ${summaryError.message}`);
    result.summariesDeleted = summaries?.length ?? 0;

    let checkpointQuery = supabase.from("checkpoints").delete();
    checkpointQuery = options.sessionId
      ? checkpointQuery.eq("session_id", options.sessionId)
      : checkpointQuery.lt("created_at", cutoff(config.lessonStateSummary));
    const { data: checkpoints, error: checkpointError } = await checkpointQuery.select("id");
    if (checkpointError) throw new Error(`retention checkpoint cleanup failed: ${checkpointError.message}`);
    result.checkpointsDeleted = checkpoints?.length ?? 0;

    if (options.sessionId || (candidateSourceSessionIds?.length ?? 0) > 0) {
      let candidateQuery = supabase
        .from("session_activity_candidates")
        .update({ context_snapshot: REDACTED_SESSION_CONTEXT });
      candidateQuery = options.sessionId
        ? candidateQuery.eq("session_id", options.sessionId)
        : candidateQuery.in("session_id", candidateSourceSessionIds ?? []);
      const { data: candidates, error: candidateError } = await candidateQuery.select("id");
      if (candidateError) throw new Error(`retention candidate snapshot cleanup failed: ${candidateError.message}`);
      result.candidateContextsRedacted = candidates?.length ?? 0;
    }

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

async function loadExpiredCandidateSourceSessionIds(
  supabase: SupabaseClient,
  lessonStateCutoff: string,
): Promise<string[]> {
  const [{ data: oldSessions, error: sessionError }, { data: oldLessonStates, error: lessonStateError }] =
    await Promise.all([
      supabase.from("sessions").select("id").lt("started_at", lessonStateCutoff),
      supabase.from("segments").select("session_id").lt("created_at", lessonStateCutoff),
    ]);

  if (sessionError) throw new Error(`retention source session lookup failed: ${sessionError.message}`);
  if (lessonStateError) throw new Error(`retention source lesson-state lookup failed: ${lessonStateError.message}`);

  return [
    ...new Set(
      [
        ...(oldSessions ?? []).map((row) => row.id),
        ...(oldLessonStates ?? []).map((row) => row.session_id),
      ].filter((id): id is string => typeof id === "string"),
    ),
  ];
}
