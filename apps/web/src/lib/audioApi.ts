import { supabase } from "./supabase";

const rawApiUrl = import.meta.env.VITE_KOBI_API_URL?.replace(/\/$/, "") ?? "";
const API_URL = rawApiUrl || (import.meta.env.DEV ? "http://localhost:8787" : "");
const CONFIGURED_RECORDING_SOURCE = import.meta.env.VITE_KOBI_RECORDING_SOURCE;
const PRERECORDED_AUDIO_PATH =
  import.meta.env.VITE_KOBI_PRERECORDED_AUDIO_PATH ?? "/local-audio/demo-audio.mp3";
const LESSON_STATE_RETRY_MS = 10_000;
const LESSON_STATE_TIMEOUT_MS = 20 * 60_000;
const LESSON_STATE_PENDING_ERROR = "No lesson_state is available for this session yet.";

function logAudioApi(message: string, details?: Record<string, unknown>) {
  if (!import.meta.env.DEV) return;
  console.info(`[Kobi audio] ${message}`, details ?? {});
}

if (import.meta.env.DEV && !rawApiUrl) {
  logAudioApi("VITE_KOBI_API_URL is missing; using dev fallback", { apiUrl: API_URL });
}

export interface CreateSessionInput {
  classId: string;
}

export interface UploadAudioChunkInput {
  sessionId: string;
  audio: Blob;
  chunkIndex: number;
  startMs: number;
  endMs: number;
}

export interface SubmitManualLessonStateInput {
  sessionId: string;
  topic: string;
  objective?: string;
}

export interface RequestActivityCandidatesInput {
  sessionId: string;
}

export type RecordingSource = "microphone" | "prerecorded";

export interface TranscriptionStatus {
  expectedChunks: number;
  uploaded: number;
  pending: number;
  transcribing: number;
  transcribed: number;
  spokenChunks: number;
  terminalFailed: number;
  lessonStateThroughChunkIndex: number | null;
  complete: boolean;
}

async function parseApiResponse<T>(response: Response): Promise<T> {
  const body = (await response.json().catch(() => ({}))) as { error?: string | { code?: string } };
  if (!response.ok) {
    const code = typeof body.error === "string" ? body.error : body.error?.code;
    throw new Error(code ?? `Kobi API request failed with ${response.status}`);
  }
  return body as T;
}

async function authenticatedHeaders(headers: Record<string, string> = {}) {
  if (!supabase) throw new Error("Supabase is not configured");
  const { data, error } = await supabase.auth.getSession();
  const token = data.session?.access_token;
  if (error || !token) throw new Error("Teacher authentication is required");
  return { ...headers, authorization: `Bearer ${token}` };
}

export function isAudioApiConfigured() {
  return API_URL.length > 0;
}

export function getRecordingSource(): RecordingSource {
  if (
    CONFIGURED_RECORDING_SOURCE === "microphone" ||
    CONFIGURED_RECORDING_SOURCE === "prerecorded"
  ) {
    return CONFIGURED_RECORDING_SOURCE;
  }
  return "microphone";
}

export function getPrerecordedAudioPath() {
  return PRERECORDED_AUDIO_PATH;
}

export function resolveBackendClassId(classId: string) {
  if (isUuid(classId)) return classId;
  throw new Error("The selected class must have a valid Supabase classes.id UUID.");
}

function isUuid(value: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

export async function createBackendSession({ classId }: CreateSessionInput) {
  if (!isAudioApiConfigured()) {
    throw new Error("VITE_KOBI_API_URL is not configured");
  }

  logAudioApi("creating session", {
    url: `${API_URL}/api/sessions`,
    classId,
  });

  const response = await fetch(`${API_URL}/api/sessions`, {
    method: "POST",
    headers: await authenticatedHeaders({ "content-type": "application/json" }),
    body: JSON.stringify({ classId }),
  });

  const payload = await parseApiResponse<{ sessionId: string }>(response);
  logAudioApi("session created", payload);
  return payload;
}

export async function uploadAudioChunk({
  sessionId,
  audio,
  chunkIndex,
  startMs,
  endMs,
}: UploadAudioChunkInput) {
  if (!isAudioApiConfigured()) {
    throw new Error("VITE_KOBI_API_URL is not configured");
  }

  const form = new FormData();
  const extension = audio.type.includes("wav") ? "wav" : audio.type.includes("mpeg") ? "mp3" : "webm";
  form.set("audio", audio, `chunk-${chunkIndex}.${extension}`);
  form.set("chunk_index", String(chunkIndex));
  form.set("start_ms", String(startMs));
  form.set("end_ms", String(endMs));

  logAudioApi("uploading audio chunk", {
    url: `${API_URL}/api/sessions/${sessionId}/audio-chunks`,
    sessionId,
    chunkIndex,
    startMs,
    endMs,
    mimeType: audio.type || "application/octet-stream",
    sizeBytes: audio.size,
  });

  const response = await fetch(`${API_URL}/api/sessions/${sessionId}/audio-chunks`, {
    method: "POST",
    headers: await authenticatedHeaders(),
    body: form,
  });

  const payload = await parseApiResponse<{ audioChunkId: string }>(response);
  logAudioApi("audio chunk accepted", {
    sessionId,
    chunkIndex,
    audioChunkId: payload.audioChunkId,
  });
  return payload;
}

export async function getTranscriptionStatus({
  sessionId,
  expectedChunks,
  signal,
}: {
  sessionId: string;
  expectedChunks: number;
  signal?: AbortSignal;
}) {
  const headers = await authenticatedHeaders();
  const response = await fetch(
    `${API_URL}/api/sessions/${sessionId}/transcription-status?expected_chunks=${expectedChunks}`,
    signal ? { headers, signal } : { headers },
  );
  return parseApiResponse<TranscriptionStatus>(response);
}

export async function submitManualLessonState({
  sessionId,
  topic,
  objective,
}: SubmitManualLessonStateInput) {
  if (!isAudioApiConfigured()) {
    throw new Error("VITE_KOBI_API_URL is not configured");
  }

  logAudioApi("submitting manual lesson_state", {
    url: `${API_URL}/api/sessions/${sessionId}/manual-lesson-state`,
    sessionId,
    topicLength: topic.length,
    hasObjective: Boolean(objective),
  });

  const response = await fetch(`${API_URL}/api/sessions/${sessionId}/manual-lesson-state`, {
    method: "POST",
    headers: await authenticatedHeaders({ "content-type": "application/json" }),
    body: JSON.stringify({ topic, objective }),
  });

  const payload = await parseApiResponse<{ segmentId: string }>(response);
  logAudioApi("manual lesson_state accepted", {
    sessionId,
    segmentId: payload.segmentId,
  });
  return payload;
}

export async function requestActivityCandidates({ sessionId }: RequestActivityCandidatesInput) {
  if (!isAudioApiConfigured()) {
    throw new Error("VITE_KOBI_API_URL is not configured");
  }

  logAudioApi("requesting activity candidates", {
    url: `${API_URL}/api/sessions/${sessionId}/activity-candidates`,
    sessionId,
  });

  const deadline = Date.now() + LESSON_STATE_TIMEOUT_MS;

  for (;;) {
    const response = await fetch(`${API_URL}/api/sessions/${sessionId}/activity-candidates`, {
      method: "POST",
      headers: await authenticatedHeaders({ "content-type": "application/json" }),
    });

    if (response.status === 409) {
      const body = (await response.json().catch(() => ({}))) as { error?: string };
      if (body.error === LESSON_STATE_PENDING_ERROR && Date.now() < deadline) {
        logAudioApi("lesson_state is still processing; retrying activity request", { sessionId });
        await new Promise((resolve) => window.setTimeout(resolve, LESSON_STATE_RETRY_MS));
        continue;
      }
      throw new Error(body.error ?? `Kobi API request failed with ${response.status}`);
    }

    const payload = await parseApiResponse<{
      inserted: number;
      reused: number;
      generated: number;
      skippedReason: string | null;
    }>(response);
    logAudioApi("activity candidates requested", payload);
    return payload;
  }
}
