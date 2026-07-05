const rawApiUrl = import.meta.env.VITE_KOBI_API_URL?.replace(/\/$/, "") ?? "";
const API_URL = rawApiUrl || (import.meta.env.DEV ? "http://localhost:8787" : "");
const DEMO_CLASS_ID = import.meta.env.VITE_KOBI_DEMO_CLASS_ID ?? "";

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

async function parseApiResponse<T>(response: Response): Promise<T> {
  const body = (await response.json().catch(() => ({}))) as { error?: string };
  if (!response.ok) {
    throw new Error(body.error ?? `Kobi API request failed with ${response.status}`);
  }
  return body as T;
}

export function isAudioApiConfigured() {
  return API_URL.length > 0;
}

export function resolveBackendClassId(classId: string) {
  if (isUuid(classId)) return classId;
  if (DEMO_CLASS_ID) return DEMO_CLASS_ID;
  throw new Error("VITE_KOBI_DEMO_CLASS_ID must be a real classes.id UUID while using demo classes.");
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
    headers: { "content-type": "application/json" },
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
  form.set("audio", audio, `chunk-${chunkIndex}.webm`);
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
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ topic, objective }),
  });

  const payload = await parseApiResponse<{ segmentId: string }>(response);
  logAudioApi("manual lesson_state accepted", {
    sessionId,
    segmentId: payload.segmentId,
  });
  return payload;
}
