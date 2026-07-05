import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { Readable } from "node:stream";
import type { SupabaseClient } from "@supabase/supabase-js";
import { lessonStateFromManualEntry } from "@kobi/ai-core";
import type PgBoss from "pg-boss";
import { JOB_TRANSCRIBE_CHUNK } from "./queue.js";

interface ApiServerOptions {
  supabase: SupabaseClient;
  boss: PgBoss;
}

const DEFAULT_AUDIO_BUCKET = "audio-chunks";

function logApi(message: string, details?: Record<string, unknown>) {
  console.info(`[Kobi API] ${message}`, details ?? {});
}

function getCorsOrigin() {
  return process.env.KOBI_API_CORS_ORIGIN ?? process.env.WEB_ORIGIN ?? "*";
}

function writeJson(
  res: ServerResponse,
  statusCode: number,
  payload: unknown,
  extraHeaders: Record<string, string> = {},
) {
  res.writeHead(statusCode, {
    "content-type": "application/json",
    "access-control-allow-origin": getCorsOrigin(),
    "access-control-allow-methods": "GET,POST,OPTIONS",
    "access-control-allow-headers": "content-type,authorization",
    ...extraHeaders,
  });
  res.end(JSON.stringify(payload));
}

function handleOptions(res: ServerResponse) {
  res.writeHead(204, {
    "access-control-allow-origin": getCorsOrigin(),
    "access-control-allow-methods": "GET,POST,OPTIONS",
    "access-control-allow-headers": "content-type,authorization",
    "access-control-max-age": "86400",
  });
  res.end();
}

function getRequestUrl(req: IncomingMessage) {
  return new URL(req.url ?? "/", `http://${req.headers.host ?? "localhost"}`);
}

async function readJsonBody(req: IncomingMessage) {
  const chunks: Buffer[] = [];
  for await (const chunk of req) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }

  if (chunks.length === 0) return {};

  return JSON.parse(Buffer.concat(chunks).toString("utf8")) as Record<string, unknown>;
}

function toWebRequest(req: IncomingMessage, url: URL) {
  return new Request(url, {
    method: req.method,
    headers: req.headers as RequestInit["headers"],
    body: Readable.toWeb(req) as RequestInit["body"],
    duplex: "half",
  } as RequestInit & { duplex: "half" });
}

function sanitizeChunkIndex(value: unknown) {
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < 0) {
    throw new Error("chunk_index must be a non-negative integer");
  }
  return parsed;
}

function sanitizeMs(value: unknown, field: string) {
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < 0) {
    throw new Error(`${field} must be a non-negative integer`);
  }
  return parsed;
}

function extensionForMimeType(mimeType: string) {
  if (mimeType.includes("webm")) return "webm";
  if (mimeType.includes("mp4")) return "mp4";
  if (mimeType.includes("mpeg")) return "mp3";
  if (mimeType.includes("wav")) return "wav";
  if (mimeType.includes("ogg")) return "ogg";
  return "bin";
}

async function createSession(req: IncomingMessage, res: ServerResponse, supabase: SupabaseClient) {
  const body = await readJsonBody(req);
  const classId = body.classId;

  if (typeof classId !== "string" || classId.trim().length === 0) {
    writeJson(res, 400, { error: "classId is required" });
    return;
  }

  logApi("creating session", { classId });

  const { data, error } = await supabase
    .from("sessions")
    .insert({ class_id: classId, status: "active" })
    .select("id")
    .single();

  if (error) {
    writeJson(res, 400, { error: error.message });
    return;
  }

  console.log(`[api] session created: sessionId=${data.id} classId=${classId}`);
  logApi("session created", { sessionId: data.id, classId });
  writeJson(res, 201, { sessionId: data.id });
}

async function createManualLessonState(
  req: IncomingMessage,
  res: ServerResponse,
  sessionId: string,
  supabase: SupabaseClient,
) {
  const body = await readJsonBody(req);
  const topic = body.topic;
  const objective = body.objective;

  if (typeof topic !== "string" || topic.trim().length === 0) {
    writeJson(res, 400, { error: "topic is required" });
    return;
  }

  const lessonState = lessonStateFromManualEntry({
    topic,
    objective: typeof objective === "string" ? objective : undefined,
  });

  logApi("creating manual lesson_state", {
    sessionId,
    topicLength: topic.length,
    hasObjective: typeof objective === "string" && objective.trim().length > 0,
  });

  const { data, error } = await supabase
    .from("segments")
    .insert({
      session_id: sessionId,
      lesson_state: lessonState,
      confidence: lessonState.confidence,
      transcript_summary: lessonState.transcript_summary,
    })
    .select("id")
    .single();

  if (error) {
    writeJson(res, 400, { error: error.message });
    return;
  }

  logApi("manual lesson_state created", { sessionId, segmentId: data.id });
  writeJson(res, 201, { segmentId: data.id, lessonState });
}

async function uploadAudioChunk(
  req: IncomingMessage,
  res: ServerResponse,
  url: URL,
  sessionId: string,
  supabase: SupabaseClient,
  boss: PgBoss,
) {
  const webRequest = toWebRequest(req, url);
  const form = await webRequest.formData();
  const audio = form.get("audio");

  if (!(audio instanceof Blob)) {
    writeJson(res, 400, { error: "audio blob is required" });
    return;
  }

  const chunkIndex = sanitizeChunkIndex(form.get("chunk_index"));
  const startMs = sanitizeMs(form.get("start_ms"), "start_ms");
  const endMs = sanitizeMs(form.get("end_ms"), "end_ms");

  if (endMs <= startMs) {
    writeJson(res, 400, { error: "end_ms must be greater than start_ms" });
    return;
  }

  const mimeType = audio.type || "application/octet-stream";
  const audioBytes = Buffer.from(await audio.arrayBuffer());
  const bucket = process.env.AUDIO_BUCKET ?? DEFAULT_AUDIO_BUCKET;
  const storagePath = `${sessionId}/${Date.now()}-${chunkIndex}.${extensionForMimeType(mimeType)}`;

  logApi("uploading audio chunk to storage", {
    sessionId,
    chunkIndex,
    startMs,
    endMs,
    mimeType,
    sizeBytes: audioBytes.length,
    bucket,
    storagePath,
  });

  const { error: uploadError } = await supabase.storage.from(bucket).upload(storagePath, audioBytes, {
    contentType: mimeType,
    upsert: false,
  });

  if (uploadError) {
    writeJson(res, 500, { error: `Audio upload failed: ${uploadError.message}` });
    return;
  }

  const { data: chunk, error: insertError } = await supabase
    .from("audio_chunks")
    .insert({
      session_id: sessionId,
      chunk_index: chunkIndex,
      storage_path: storagePath,
      start_ms: startMs,
      end_ms: endMs,
      status: "pending",
    })
    .select("id")
    .single();

  if (insertError) {
    writeJson(res, 400, { error: insertError.message });
    return;
  }

  logApi("audio chunk row inserted", { sessionId, chunkIndex, audioChunkId: chunk.id });

  const { data: signedUrl, error: signedUrlError } = await supabase.storage
    .from(bucket)
    .createSignedUrl(storagePath, 60 * 60);

  if (signedUrlError) {
    writeJson(res, 500, { error: `Signed audio URL failed: ${signedUrlError.message}` });
    return;
  }

  console.log(
    `[api] audio chunk received: session=${sessionId} chunkId=${chunk.id} index=${chunkIndex} mime=${mimeType} size=${audioBytes.byteLength}B range=${startMs}-${endMs}ms`,
  );

  try {
    await boss.send(JOB_TRANSCRIBE_CHUNK, {
      audioChunkId: chunk.id,
      audioUrl: signedUrl.signedUrl,
      mimeType,
      sessionId,
    });
    console.log(`[api] enqueued transcribe-chunk for chunkId=${chunk.id}`);
  } catch (queueError) {
    const message = queueError instanceof Error ? queueError.message : "Failed to enqueue transcription job";
    writeJson(res, 500, { error: message });
    return;
  }

  writeJson(res, 201, { audioChunkId: chunk.id });
}

async function routeRequest(
  req: IncomingMessage,
  res: ServerResponse,
  supabase: SupabaseClient,
  boss: PgBoss,
) {
  if (req.method === "OPTIONS") {
    handleOptions(res);
    return;
  }

  const url = getRequestUrl(req);
  logApi("request", { method: req.method, path: url.pathname });

  if (req.method === "GET" && url.pathname === "/health") {
    writeJson(res, 200, { ok: true });
    return;
  }

  if (req.method === "POST" && url.pathname === "/api/sessions") {
    await createSession(req, res, supabase);
    return;
  }

  const audioChunkMatch = url.pathname.match(/^\/api\/sessions\/([^/]+)\/audio-chunks$/);
  if (req.method === "POST" && audioChunkMatch?.[1]) {
    await uploadAudioChunk(req, res, url, audioChunkMatch[1], supabase, boss);
    return;
  }

  const manualLessonStateMatch = url.pathname.match(/^\/api\/sessions\/([^/]+)\/manual-lesson-state$/);
  if (req.method === "POST" && manualLessonStateMatch?.[1]) {
    await createManualLessonState(req, res, manualLessonStateMatch[1], supabase);
    return;
  }

  writeJson(res, 404, { error: "Not found" });
}

export function startApiServer({ supabase, boss }: ApiServerOptions) {
  const port = Number(process.env.PORT ?? process.env.API_PORT ?? 8787);
  const server = createServer((req, res) => {
    routeRequest(req, res, supabase, boss).catch((error: unknown) => {
      const message = error instanceof Error ? error.message : "Unexpected API error";
      writeJson(res, 500, { error: message });
    });
  });

  server.on("error", (err: NodeJS.ErrnoException) => {
    if (err.code === "EADDRINUSE") {
      console.error(
        `[api] port ${port} already in use — stop the other worker (or run: netstat -ano | findstr :${port})`,
      );
      process.exit(1);
    }
    throw err;
  });

  server.listen(port, () => {
    console.log(`Kobi API listening on http://localhost:${port}`);
  });

  return server;
}
