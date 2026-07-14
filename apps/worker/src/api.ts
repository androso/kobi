import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { Readable } from "node:stream";
import type { SupabaseClient } from "@supabase/supabase-js";
import { buildCurriculumQueryText, embedText, retrieveCurriculumMatches } from "@kobi/curriculum";
import { classifySafeError, lessonStateFromManualEntry, lessonStateSchema, safeLog, type LessonState } from "@kobi/ai-core";
import type PgBoss from "pg-boss";
import { demoTranscriptChunks, DEMO_TRANSCRIPT_TICK_MS } from "./demoTranscript.js";
import { JOB_BUILD_LESSON_STATE, JOB_TRANSCRIBE_CHUNK } from "./queue.js";
import { runGenerateActivityArtifactsJob } from "./jobs/generateActivityArtifacts.job.js";

interface ApiServerOptions {
  supabase: SupabaseClient;
  boss?: PgBoss;
  getBoss?: () => PgBoss | undefined;
}

const DEFAULT_AUDIO_BUCKET = "audio-chunks";
const DEMO_MODE = "demo";
const DEMO_CURRICULUM = {
  grade: 7,
  subject: "matematicas",
  unit: "geometria-triangulos-cuadrilateros",
  objective_code: "M7.GEO.1",
  text:
    "Conozcamos los triangulos y cuadrilateros: identifica segmentos, lados, vertices y angulos en figuras planas. Clasifica figuras con tres lados como triangulos y figuras con cuatro lados como cuadrilateros, usando el conteo de lados, vertices y angulos.",
};

class ApiRequestError extends Error {
  constructor(
    message: string,
    readonly statusCode = 400,
  ) {
    super(message);
  }
}

function logApi(message: string, details?: Record<string, unknown>) {
  safeLog("info", `api.${message.replaceAll(" ", "_")}`, details);
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
    "access-control-allow-methods": "GET,POST,PATCH,OPTIONS",
    "access-control-allow-headers": "content-type,authorization",
    ...extraHeaders,
  });
  res.end(JSON.stringify(payload));
}

function handleOptions(res: ServerResponse) {
  res.writeHead(204, {
    "access-control-allow-origin": getCorsOrigin(),
    "access-control-allow-methods": "GET,POST,PATCH,OPTIONS",
    "access-control-allow-headers": "content-type,authorization",
    "access-control-max-age": "86400",
  });
  res.end();
}

function getRequestUrl(req: IncomingMessage) {
  return new URL(req.url ?? "/", `http://${req.headers.host ?? "localhost"}`);
}

const STUDENT_EMAIL_DOMAIN = "students.kobi.invalid";
const MIN_STUDENT_PASSWORD_LENGTH = 8;

function normalizeUsername(value: string) {
  return value.trim().toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9-]/g, "");
}

function usernameEmail(username: string) {
  return `${username}@${STUDENT_EMAIL_DOMAIN}`;
}

async function requireTeacher(req: IncomingMessage, supabase: SupabaseClient) {
  const token = req.headers.authorization?.match(/^Bearer\s+(.+)$/i)?.[1];
  if (!token) throw new ApiRequestError("Unauthorized", 401);
  const { data, error } = await supabase.auth.getUser(token);
  if (error || !data.user || data.user.user_metadata?.role === "student") throw new ApiRequestError("Unauthorized", 401);
  return data.user;
}

async function requireOwnedClass(req: IncomingMessage, supabase: SupabaseClient, classId: string) {
  const teacher = await requireTeacher(req, supabase);
  const { data } = await supabase.from("classes").select("id").eq("id", classId).eq("teacher_id", teacher.id).maybeSingle();
  if (!data) throw new ApiRequestError("Class not found", 404);
  return teacher;
}

async function listRoster(req: IncomingMessage, res: ServerResponse, classId: string, supabase: SupabaseClient) {
  await requireOwnedClass(req, supabase, classId);
  const { data, error } = await supabase.from("students")
    .select("id,class_id,display_name,username,is_active,activated_at,joined_at")
    .eq("class_id", classId).not("auth_user_id", "is", null).order("display_name");
  if (error) throw new ApiRequestError(error.message);
  writeJson(res, 200, { students: data ?? [] });
}

async function createRosterStudent(req: IncomingMessage, res: ServerResponse, classId: string, supabase: SupabaseClient) {
  await requireOwnedClass(req, supabase, classId);
  const body = await readJsonBody(req);
  const displayName = typeof body.displayName === "string" ? body.displayName.trim() : "";
  const password = typeof body.password === "string" ? body.password : "";
  if (!displayName) throw new ApiRequestError("displayName is required");
  if (password.length < MIN_STUDENT_PASSWORD_LENGTH) throw new ApiRequestError(`Password must be at least ${MIN_STUDENT_PASSWORD_LENGTH} characters`);
  const { data: existingStudent, error: existingStudentError } = await supabase
    .from("students")
    .select("id,auth_user_id")
    .eq("class_id", classId)
    .ilike("display_name", displayName)
    .maybeSingle();
  if (existingStudentError) throw new ApiRequestError(existingStudentError.message);
  if (existingStudent?.auth_user_id) {
    throw new ApiRequestError("A student account with this name already exists", 409);
  }

  const base = normalizeUsername(displayName).replace(/^-+|-+$/g, "") || "estudiante";
  let authUserId: string | undefined;
  for (let attempt = 0; attempt < 5; attempt += 1) {
    const username = `${base}-${crypto.randomUUID().replace(/-/g, "").slice(0, 6)}`;
    const { data: authData, error: authError } = await supabase.auth.admin.createUser({
      email: usernameEmail(username), password, email_confirm: true,
      user_metadata: { role: "student", username, display_name: displayName },
    });
    if (authError) {
      logApi("student Auth account creation failed", {
        classId,
        attempt: attempt + 1,
        username,
        error: authError.message,
        status: authError.status,
        code: authError.code,
      });
      continue;
    }
    authUserId = authData.user.id;
    const studentValues = {
      class_id: classId, display_name: displayName, username, auth_user_id: authUserId,
      is_active: true, activated_at: new Date().toISOString(), access_token: null,
    };
    const { data, error } = existingStudent?.id
      ? await supabase.from("students").update(studentValues).eq("id", existingStudent.id).select("id,class_id,display_name,username,is_active,activated_at,joined_at").single()
      : await supabase.from("students").insert(studentValues).select("id,class_id,display_name,username,is_active,activated_at,joined_at").single();
    if (!error) { writeJson(res, 201, { student: data }); return; }
    logApi("student database row creation failed", {
      classId,
      attempt: attempt + 1,
      username,
      authUserId,
      error: error.message,
      code: error.code,
      details: error.details,
      hint: error.hint,
    });
    const { error: cleanupError } = await supabase.auth.admin.deleteUser(authUserId);
    if (cleanupError) {
      logApi("student Auth account cleanup failed", {
        classId,
        attempt: attempt + 1,
        username,
        authUserId,
        error: cleanupError.message,
        status: cleanupError.status,
        code: cleanupError.code,
      });
    }
    authUserId = undefined;
  }
  logApi("student account provisioning exhausted retries", { classId, displayName, attempts: 5 });
  throw new ApiRequestError("Unable to provision student account", 409);
}

async function updateRosterStudent(req: IncomingMessage, res: ServerResponse, classId: string, studentId: string, action: string, supabase: SupabaseClient) {
  await requireOwnedClass(req, supabase, classId);
  const { data: student } = await supabase.from("students").select("id,auth_user_id").eq("id", studentId).eq("class_id", classId).not("auth_user_id", "is", null).maybeSingle();
  if (!student?.auth_user_id) throw new ApiRequestError("Student not found", 404);
  if (action === "password") {
    const body = await readJsonBody(req); const password = typeof body.password === "string" ? body.password : "";
    if (password.length < MIN_STUDENT_PASSWORD_LENGTH) throw new ApiRequestError(`Password must be at least ${MIN_STUDENT_PASSWORD_LENGTH} characters`);
    const { error } = await supabase.auth.admin.updateUserById(student.auth_user_id, { password });
    if (error) throw new ApiRequestError("Unable to reset password", 400);
  } else if (action === "deactivate" || action === "reactivate") {
    const active = action === "reactivate";
    const { error } = await supabase.auth.admin.updateUserById(student.auth_user_id, { ban_duration: active ? "none" : "876000h" });
    if (error) throw new ApiRequestError("Unable to update account", 400);
    const { error: rowError } = await supabase.from("students").update({ is_active: active, activated_at: active ? new Date().toISOString() : null }).eq("id", studentId);
    if (rowError) throw new ApiRequestError(rowError.message);
  } else throw new ApiRequestError("Unknown roster action", 404);
  writeJson(res, 200, { ok: true });
}

async function readJsonBody(req: IncomingMessage) {
  const chunks: Buffer[] = [];
  for await (const chunk of req) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }

  if (chunks.length === 0) return {};

  try {
    return JSON.parse(Buffer.concat(chunks).toString("utf8")) as Record<string, unknown>;
  } catch {
    throw new ApiRequestError("Request body must be valid JSON");
  }
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

function isDemoMode() {
  return process.env.KOBI_PROJECT_MODE === DEMO_MODE;
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
  if (isDemoMode()) {
    await configureDemoClass(supabase, classId);
  }

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

async function configureDemoClass(supabase: SupabaseClient, classId: string) {
  const { error } = await supabase
    .from("classes")
    .update({
      grade: DEMO_CURRICULUM.grade,
      subject: DEMO_CURRICULUM.subject,
      unit: DEMO_CURRICULUM.unit,
    })
    .eq("id", classId);

  if (error) {
    logApi("demo class metadata update failed", { classId, error: error.message });
  }
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

async function ensureDemoCurriculumSeed(supabase: SupabaseClient) {
  const { data: existing, error: selectError } = await supabase
    .from("curriculum_chunks")
    .select("id")
    .eq("grade", DEMO_CURRICULUM.grade)
    .eq("subject", DEMO_CURRICULUM.subject)
    .eq("unit", DEMO_CURRICULUM.unit)
    .limit(1);

  if (selectError) {
    logApi("demo curriculum seed check failed", { error: selectError.message });
    return;
  }

  if ((existing ?? []).length > 0) return;

  try {
    const embedding = await embedText(DEMO_CURRICULUM.text, "RETRIEVAL_DOCUMENT");
    const { error: insertError } = await supabase.from("curriculum_chunks").insert({
      ...DEMO_CURRICULUM,
      embedding,
    });

    if (insertError) {
      logApi("demo curriculum seed insert failed", { error: insertError.message });
    } else {
      logApi("demo curriculum seed inserted", {
        grade: DEMO_CURRICULUM.grade,
        subject: DEMO_CURRICULUM.subject,
        unit: DEMO_CURRICULUM.unit,
      });
    }
  } catch (error) {
    logApi("demo curriculum seed skipped", {
      error: error instanceof Error ? error.message : "Embedding failed",
    });
  }
}

async function createDemoTranscriptChunk(
  req: IncomingMessage,
  res: ServerResponse,
  sessionId: string,
  supabase: SupabaseClient,
  boss: PgBoss,
) {
  if (!isDemoMode()) {
    writeJson(res, 403, { error: "Demo transcript chunks are only available when KOBI_PROJECT_MODE=demo." });
    return;
  }

  const body = await readJsonBody(req);
  let chunkIndex: number;
  try {
    chunkIndex = sanitizeChunkIndex(body.chunk_index);
  } catch (error) {
    writeJson(res, 400, { error: error instanceof Error ? error.message : "Invalid chunk_index" });
    return;
  }

  const transcriptText = demoTranscriptChunks[chunkIndex];
  if (!transcriptText) {
    writeJson(res, 400, { error: `chunk_index must be between 0 and ${demoTranscriptChunks.length - 1}` });
    return;
  }

  await ensureDemoCurriculumSeed(supabase);

  const { data: existing, error: existingError } = await supabase
    .from("audio_chunks")
    .select("id")
    .eq("session_id", sessionId)
    .eq("chunk_index", chunkIndex)
    .maybeSingle();

  if (existingError) {
    writeJson(res, 400, { error: existingError.message });
    return;
  }

  if (existing?.id) {
    writeJson(res, 200, {
      audioChunkId: existing.id,
      chunkIndex,
      totalChunks: demoTranscriptChunks.length,
      done: chunkIndex === demoTranscriptChunks.length - 1,
    });
    return;
  }

  const { data: chunk, error: insertError } = await supabase
    .from("audio_chunks")
    .insert({
      session_id: sessionId,
      chunk_index: chunkIndex,
      storage_path: `demo-transcript/${sessionId}/${chunkIndex}.txt`,
      start_ms: chunkIndex * DEMO_TRANSCRIPT_TICK_MS,
      end_ms: (chunkIndex + 1) * DEMO_TRANSCRIPT_TICK_MS,
      status: "transcribed",
      transcript_text: transcriptText,
    })
    .select("id")
    .single();

  if (insertError) {
    writeJson(res, 400, { error: insertError.message });
    return;
  }

  await boss.send(JOB_BUILD_LESSON_STATE, { sessionId });

  writeJson(res, 201, {
    audioChunkId: chunk.id,
    chunkIndex,
    totalChunks: demoTranscriptChunks.length,
    done: chunkIndex === demoTranscriptChunks.length - 1,
  });
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
  let form: FormData;
  try {
    form = await webRequest.formData();
  } catch {
    writeJson(res, 400, { error: "Request body must be multipart/form-data." });
    return;
  }
  const audio = form.get("audio");

  if (!(audio instanceof Blob)) {
    writeJson(res, 400, { error: "audio blob is required" });
    return;
  }

  let chunkIndex: number;
  let startMs: number;
  let endMs: number;
  try {
    chunkIndex = sanitizeChunkIndex(form.get("chunk_index"));
    startMs = sanitizeMs(form.get("start_ms"), "start_ms");
    endMs = sanitizeMs(form.get("end_ms"), "end_ms");
  } catch (error) {
    writeJson(res, 400, { error: error instanceof Error ? error.message : "Invalid audio chunk metadata" });
    return;
  }

  if (endMs <= startMs) {
    writeJson(res, 400, { error: "end_ms must be greater than start_ms" });
    return;
  }

  const mimeType = audio.type || "application/octet-stream";
  const audioBytes = Buffer.from(await audio.arrayBuffer());

  if (audioBytes.length < 256) {
    logApi("audio chunk suspiciously small — may be empty or corrupted", {
      sessionId,
      chunkIndex,
      sizeBytes: audioBytes.length,
    });
  }

  const bucket = process.env.AUDIO_BUCKET ?? DEFAULT_AUDIO_BUCKET;
  const storagePath = `${sessionId}/${Date.now()}-${chunkIndex}.${extensionForMimeType(mimeType)}`;

  logApi("uploading audio chunk to storage", {
    sessionId,
    chunkIndex,
    sizeBytes: audioBytes.length,
    durationMs: endMs - startMs,
  });

  const { error: uploadError } = await supabase.storage.from(bucket).upload(storagePath, audioBytes, {
    contentType: mimeType,
    upsert: false,
  });

  if (uploadError) {
    safeLog("error", "audio.upload_failed", { sessionId, outcome: classifySafeError(uploadError) });
    writeJson(res, 500, { error: "Audio upload failed" });
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
    safeLog("error", "audio.signing_failed", { sessionId, audioChunkId: chunk.id, outcome: classifySafeError(signedUrlError) });
    writeJson(res, 500, { error: "Signed audio URL failed" });
    return;
  }

  safeLog("info", "audio.received", { sessionId, audioChunkId: chunk.id, chunkIndex, sizeBytes: audioBytes.byteLength, durationMs: endMs - startMs });

  try {
    await boss.send(JOB_TRANSCRIBE_CHUNK, {
      audioChunkId: chunk.id,
      audioUrl: signedUrl.signedUrl,
      mimeType,
      sessionId,
    });
    safeLog("info", "audio.transcription_enqueued", { sessionId, audioChunkId: chunk.id });
  } catch (queueError) {
    const message = queueError instanceof Error ? queueError.message : "Failed to enqueue transcription job";
    writeJson(res, 500, { error: message });
    return;
  }

  writeJson(res, 201, { audioChunkId: chunk.id });
}

async function createActivityCandidates(
  res: ServerResponse,
  sessionId: string,
  supabase: SupabaseClient,
) {
  const lessonState = await loadLatestLessonState(supabase, sessionId);
  if (!lessonState) {
    writeJson(res, 409, { error: "No lesson_state is available for this session yet." });
    return;
  }

  const classContext = await loadSessionClassContext(supabase, sessionId);
  const curriculumMatches = await retrieveCurriculumMatches(supabase, {
    queryText: buildCurriculumQueryText(lessonState),
    grade: classContext.grade,
    subject: classContext.subject,
    unit: classContext.unit,
  });

  const result = await runGenerateActivityArtifactsJob(supabase, {
    sessionId,
    lessonState,
    curriculumMatches,
  });

  writeJson(res, result.skippedReason ? 200 : 201, result);
}

async function loadLatestLessonState(
  supabase: SupabaseClient,
  sessionId: string,
): Promise<LessonState | null> {
  const { data, error } = await supabase
    .from("segments")
    .select("lesson_state")
    .eq("session_id", sessionId)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) {
    throw new Error(`Activity candidate request failed to load lesson_state: ${error.message}`);
  }

  const parsed = lessonStateSchema.safeParse(data?.lesson_state);
  return parsed.success ? parsed.data : null;
}

async function loadSessionClassContext(
  supabase: SupabaseClient,
  sessionId: string,
): Promise<{ grade: number; subject: string; unit?: string }> {
  const { data, error } = await supabase
    .from("sessions")
    .select("classes(grade, subject, unit)")
    .eq("id", sessionId)
    .maybeSingle();

  if (error) {
    throw new Error(`Activity candidate request failed to load class context: ${error.message}`);
  }

  const classContext = normalizeClassContext(data?.classes);
  return {
    grade: classContext?.grade ?? 7,
    subject: classContext?.subject ?? "lenguaje",
    unit: classContext?.unit,
  };
}

function normalizeClassContext(value: unknown): { grade: number; subject: string; unit: string } | null {
  const raw = Array.isArray(value) ? value[0] : value;
  if (!raw || typeof raw !== "object") return null;

  const row = raw as Record<string, unknown>;
  const grade = Number(row.grade);
  const subject = typeof row.subject === "string" ? row.subject : "";
  const unit = typeof row.unit === "string" ? row.unit : "";

  if (!Number.isInteger(grade) || grade <= 0 || !subject) return null;
  return { grade, subject, unit };
}

export async function routeRequest(
  req: IncomingMessage,
  res: ServerResponse,
  supabase: SupabaseClient,
  boss?: PgBoss,
) {
  try {
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

    const rosterMatch = url.pathname.match(/^\/api\/classes\/([^/]+)\/students$/);
    if (req.method === "GET" && rosterMatch?.[1]) { await listRoster(req, res, rosterMatch[1], supabase); return; }
    if (req.method === "POST" && rosterMatch?.[1]) { await createRosterStudent(req, res, rosterMatch[1], supabase); return; }
    const rosterActionMatch = url.pathname.match(/^\/api\/classes\/([^/]+)\/students\/([^/]+)\/(password|deactivate|reactivate)$/);
    if (req.method === "POST" && rosterActionMatch?.[1] && rosterActionMatch[2] && rosterActionMatch[3]) {
      await updateRosterStudent(req, res, rosterActionMatch[1], rosterActionMatch[2], rosterActionMatch[3], supabase); return;
    }

    if (req.method === "POST" && url.pathname === "/api/sessions") {
      await createSession(req, res, supabase);
      return;
    }

    const audioChunkMatch = url.pathname.match(/^\/api\/sessions\/([^/]+)\/audio-chunks$/);
    if (req.method === "POST" && audioChunkMatch?.[1]) {
      if (!boss) throw new ApiRequestError("The background queue is still starting", 503);
      await uploadAudioChunk(req, res, url, audioChunkMatch[1], supabase, boss);
      return;
    }

    const demoTranscriptChunkMatch = url.pathname.match(/^\/api\/sessions\/([^/]+)\/demo-transcript-chunks$/);
    if (req.method === "POST" && demoTranscriptChunkMatch?.[1]) {
      if (!boss) throw new ApiRequestError("The background queue is still starting", 503);
      await createDemoTranscriptChunk(req, res, demoTranscriptChunkMatch[1], supabase, boss);
      return;
    }

    const manualLessonStateMatch = url.pathname.match(/^\/api\/sessions\/([^/]+)\/manual-lesson-state$/);
    if (req.method === "POST" && manualLessonStateMatch?.[1]) {
      await createManualLessonState(req, res, manualLessonStateMatch[1], supabase);
      return;
    }

    const activityCandidatesMatch = url.pathname.match(/^\/api\/sessions\/([^/]+)\/activity-candidates$/);
    if (req.method === "POST" && activityCandidatesMatch?.[1]) {
      await createActivityCandidates(res, activityCandidatesMatch[1], supabase);
      return;
    }

    writeJson(res, 404, { error: "Not found" });
  } catch (error) {
    const statusCode = error instanceof ApiRequestError ? error.statusCode : 500;
    const message = error instanceof ApiRequestError ? error.message : "Unexpected API error";
    if (!(error instanceof ApiRequestError)) {
      safeLog("error", "api.request_failed", { outcome: classifySafeError(error) });
    }
    writeJson(res, statusCode, { error: message });
  }
}

export function startApiServer({ supabase, boss, getBoss }: ApiServerOptions) {
  const port = Number(process.env.PORT ?? process.env.API_PORT ?? 8787);
  const server = createServer((req, res) => {
    routeRequest(req, res, supabase, getBoss?.() ?? boss).catch((error: unknown) => {
      safeLog("error", "api.unhandled_request_failure", { outcome: classifySafeError(error) });
      writeJson(res, 500, { error: "Unexpected API error" });
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
