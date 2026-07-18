import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { Readable } from "node:stream";
import type { SupabaseClient } from "@supabase/supabase-js";
import { buildCurriculumQueryText, embedText, retrieveCurriculumMatches } from "@kobi/curriculum";
import { classifySafeError, lessonStateFromManualEntry, lessonStateSchema, safeLog, type LessonState } from "@kobi/ai-core";
import type PgBoss from "pg-boss";
import { z } from "zod";
import { JOB_BUILD_LESSON_STATE, JOB_INGEST_CURRICULUM_SOURCE, JOB_TRANSCRIBE_CHUNK } from "./queue.js";
import { loadSelectedCurriculumSourceIds } from "./curriculumSelections.js";
import { runGenerateActivityArtifactsJob } from "./jobs/generateActivityArtifacts.job.js";
import {
  createOpenAiActivityGeneratorFromEnv,
  validateOpenAiActivityConfig,
} from "./activity-generation/openaiArtifactGenerator.js";

interface ApiServerOptions {
  supabase: SupabaseClient;
  boss?: PgBoss;
  getBoss?: () => PgBoss | undefined;
}

const DEFAULT_AUDIO_BUCKET = "audio-chunks";
const DEFAULT_CURRICULUM_BUCKET = "curriculum-sources";
const MAX_CURRICULUM_PDF_BYTES = 50 * 1024 * 1024;
const MAX_CURRICULUM_PDF_PAGES = 400;
const SIGNED_UPLOAD_TTL_SECONDS = 60 * 30;
class ApiRequestError extends Error {
  constructor(
    readonly code: string,
    readonly statusCode = 400,
  ) {
    super(code);
  }
}

interface ApiActor { id: string }

const uuidSchema = z.string().uuid();
const createSessionSchema = z.object({ classId: uuidSchema }).strict();
const manualLessonStateSchema = z.object({
  topic: z.string().trim().min(1).max(2_000),
  objective: z.string().trim().max(2_000).optional(),
}).strict();
const createCurriculumUploadSchema = z.object({
  filename: z.string().trim().min(1).max(255),
  contentType: z.string().trim().min(1).max(120),
  sizeBytes: z.number().int().positive().max(MAX_CURRICULUM_PDF_BYTES),
  pageCount: z.number().int().positive().max(MAX_CURRICULUM_PDF_PAGES),
}).strict();
const completeCurriculumUploadSchema = z.object({
  sourceId: uuidSchema,
}).strict();
const replaceCurriculumSelectionsSchema = z.object({
  sourceIds: z.array(uuidSchema).max(50),
}).strict().refine((value) => new Set(value.sourceIds).size === value.sourceIds.length, {
  message: "sourceIds must be unique",
});
const retrieveCurriculumSchema = z.object({
  queryText: z.string().trim().min(1).max(4_000).optional(),
  topic: z.string().trim().min(1).max(2_000).optional(),
  objective: z.string().trim().max(2_000).optional(),
  keyTerms: z.array(z.string().trim().min(1).max(80)).max(20).optional(),
  matchCount: z.number().int().min(1).max(8).optional(),
}).strict();
const MAX_JSON_BODY_BYTES = 32 * 1024;
const MAX_AUDIO_BYTES = 10 * 1024 * 1024;
const RATE_WINDOW_MS = 60_000;
const CORS_ALLOWED_METHODS = "GET,POST,PATCH,PUT,OPTIONS";
const rateBuckets = new Map<string, { count: number; resetAt: number }>();

function logApi(message: string, details?: Record<string, unknown>) {
  safeLog("info", `api.${message.replaceAll(" ", "_")}`, details);
}

function getAllowedOrigins() {
  const configured = process.env.KOBI_API_CORS_ORIGINS ?? process.env.KOBI_API_CORS_ORIGIN ?? process.env.WEB_ORIGIN;
  if (configured) return configured.split(",").map((origin) => origin.trim()).filter(Boolean);
  return process.env.NODE_ENV === "production" ? [] : ["http://localhost:5173", "http://127.0.0.1:5173"];
}

function corsHeaders(req?: IncomingMessage) {
  const origin = req?.headers.origin;
  return origin && getAllowedOrigins().includes(origin) ? { "access-control-allow-origin": origin, vary: "origin" } : {};
}

function writeJson(
  res: ServerResponse,
  statusCode: number,
  payload: unknown,
  extraHeaders: Record<string, string> = {},
  req?: IncomingMessage,
) {
  res.writeHead(statusCode, {
    "content-type": "application/json",
    "access-control-allow-methods": CORS_ALLOWED_METHODS,
    "access-control-allow-headers": "content-type,authorization",
    ...corsHeaders(req),
    ...extraHeaders,
  });
  res.end(JSON.stringify(payload));
}

function handleOptions(req: IncomingMessage, res: ServerResponse) {
  res.writeHead(204, {
    "access-control-allow-methods": CORS_ALLOWED_METHODS,
    "access-control-allow-headers": "content-type,authorization",
    "access-control-max-age": "86400",
    ...corsHeaders(req),
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
  let bytes = 0;
  for await (const chunk of req) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    bytes += buffer.length;
    if (bytes > MAX_JSON_BODY_BYTES) throw new ApiRequestError("request_too_large", 413);
    chunks.push(buffer);
  }

  if (chunks.length === 0) return {};

  try {
    return JSON.parse(Buffer.concat(chunks).toString("utf8")) as Record<string, unknown>;
  } catch {
    throw new ApiRequestError("invalid_json", 400);
  }
}

function parseBody<T>(schema: z.ZodType<T>, body: unknown): T {
  const parsed = schema.safeParse(body);
  if (!parsed.success) throw new ApiRequestError("invalid_request", 422);
  return parsed.data;
}

async function authenticate(req: IncomingMessage, supabase: SupabaseClient): Promise<ApiActor> {
  const authorization = req.headers.authorization;
  const match = typeof authorization === "string" ? authorization.match(/^Bearer\s+(.+)$/i) : null;
  if (!match?.[1]) throw new ApiRequestError("authentication_required", 401);
  const { data, error } = await supabase.auth.getUser(match[1]);
  if (error || !data.user) throw new ApiRequestError("invalid_token", 401);
  return { id: data.user.id };
}

async function authorizeClass(supabase: SupabaseClient, classId: string, actor: ApiActor) {
  const { data, error } = await supabase.from("classes").select("teacher_id").eq("id", classId).maybeSingle();
  if (error) throw new ApiRequestError("datastore_error", 500);
  if (!data) throw new ApiRequestError("class_not_found", 404);
  if (data.teacher_id !== actor.id) throw new ApiRequestError("forbidden", 403);
}

async function authorizeSession(supabase: SupabaseClient, sessionId: string, actor: ApiActor) {
  const { data, error } = await supabase.from("sessions").select("classes(teacher_id)").eq("id", sessionId).maybeSingle();
  if (error) throw new ApiRequestError("datastore_error", 500);
  if (!data) throw new ApiRequestError("session_not_found", 404);
  const value = Array.isArray(data.classes) ? data.classes[0] : data.classes;
  const teacherId = value && typeof value === "object" ? (value as { teacher_id?: unknown }).teacher_id : null;
  if (teacherId !== actor.id) throw new ApiRequestError("forbidden", 403);
}

function enforceRateLimit(key: string, limit: number) {
  const now = Date.now();
  const current = rateBuckets.get(key);
  if (!current || current.resetAt <= now) {
    rateBuckets.set(key, { count: 1, resetAt: now + RATE_WINDOW_MS });
    return;
  }
  if (current.count >= limit) throw new ApiRequestError("rate_limit_exceeded", 429);
  current.count += 1;
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

async function createSession(req: IncomingMessage, res: ServerResponse, supabase: SupabaseClient, actor: ApiActor) {
  const { classId } = parseBody(createSessionSchema, await readJsonBody(req));
  await authorizeClass(supabase, classId, actor);

  logApi("creating session", { classId });
  const { data, error } = await supabase
    .from("sessions")
    .insert({ class_id: classId, status: "active" })
    .select("id")
    .single();

  if (error) {
    throw new ApiRequestError("session_create_failed", 500);
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
  const { topic, objective } = parseBody(manualLessonStateSchema, await readJsonBody(req));

  const lessonState = lessonStateFromManualEntry({
    topic,
    objective,
  });

  logApi("creating manual lesson_state", {
    sessionId,
    topicLength: topic.length,
    hasObjective: Boolean(objective),
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
    throw new ApiRequestError("lesson_state_create_failed", 500);
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
  if (audioBytes.length > MAX_AUDIO_BYTES) throw new ApiRequestError("audio_too_large", 413);

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
    throw new ApiRequestError("audio_upload_failed", 500);
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
    throw new ApiRequestError("audio_chunk_create_failed", 500);
  }

  logApi("audio chunk row inserted", { sessionId, chunkIndex, audioChunkId: chunk.id });

  const { data: signedUrl, error: signedUrlError } = await supabase.storage
    .from(bucket)
    .createSignedUrl(storagePath, 60 * 60);

  if (signedUrlError) {
    safeLog("error", "audio.signing_failed", { sessionId, audioChunkId: chunk.id, outcome: classifySafeError(signedUrlError) });
    throw new ApiRequestError("audio_url_create_failed", 500);
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
    throw new ApiRequestError("transcription_enqueue_failed", 500);
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

  const startedAt = Date.now();
  let stage = "loading class context";
  logApi("activity generation starting", {
    sessionId,
    topic: lessonState.topic,
    confidence: lessonState.confidence,
  });

  try {
    const classContext = await loadSessionClassContext(supabase, sessionId);
    const sourceIds = await loadSelectedCurriculumSourceIds(supabase, classContext.classId);
    stage = "retrieving curriculum matches";
    logApi("activity generation retrieving curriculum", { sessionId, ...classContext });
    const curriculumMatches = await retrieveCurriculumMatches(supabase, {
      queryText: buildCurriculumQueryText(lessonState),
      grade: classContext.grade,
      subject: classContext.subject,
      unit: classContext.unit,
      sourceIds,
    });

    stage = "generating artifacts";
    logApi("activity generation curriculum ready", {
      sessionId,
      curriculumMatchCount: curriculumMatches.length,
    });
    const activityConfig = validateOpenAiActivityConfig(process.env);
    const openAiGenerator = createOpenAiActivityGeneratorFromEnv(process.env);
    logApi("activity generator configured", {
      sessionId,
      provider: openAiGenerator ? "openai" : "static fallback",
      model: openAiGenerator ? activityConfig.model : null,
    });
    const result = await runGenerateActivityArtifactsJob(supabase, {
      sessionId,
      lessonState,
      curriculumMatches,
    }, {
      openAiGenerator,
    });

    logApi("activity generation finished", {
      sessionId,
      durationMs: Date.now() - startedAt,
      ...result,
    });
    writeJson(res, result.skippedReason ? 200 : 201, result);
  } catch (error) {
    safeLog("error", "activity_generation.failed", {
      sessionId,
      stage,
      latencyMs: Date.now() - startedAt,
      outcome: classifySafeError(error),
    });
    throw error;
  }
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
): Promise<{ classId?: string; grade: number; subject: string; unit?: string }> {
  const { data, error } = await supabase
    .from("sessions")
    .select("class_id, classes(grade, subject, unit)")
    .eq("id", sessionId)
    .maybeSingle();

  if (error) {
    throw new Error(`Activity candidate request failed to load class context: ${error.message}`);
  }

  const classContext = normalizeClassContext(data?.classes);
  return {
    classId: typeof data?.class_id === "string" ? data.class_id : undefined,
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
/**
 * Sanitizes a curriculum filename to be safe for storage keys.
 *  
 * @param filename - Raw filename or path (e.g. "Libro de texto 7.° grado-0.pdf")
 * @returns Sanitized filename safe for storage keys
 * @example
 * sanitizeCurriculumFilename("Libro de texto 7.° grado-0.pdf")
 * // => "Libro-de-texto-7.-grado-0.pdf"
 */
function sanitizeCurriculumFilename(filename: string): string {
  const base = filename.split(/[/\\]/).pop()?.trim() || "curriculum.pdf";
  const cleaned = base.replace(/[^a-zA-Z0-9._-]+/g, "-").replace(/-+/g, "-").replace(/^-|-$/g, "");
  const withExtension = cleaned.toLowerCase().endsWith(".pdf") ? cleaned : `${cleaned || "curriculum"}.pdf`;
  return withExtension.slice(0, 180);
}

async function createCurriculumUploadUrl(
  req: IncomingMessage,
  res: ServerResponse,
  classId: string,
  supabase: SupabaseClient,
  actor: ApiActor,
) {
  await authorizeClass(supabase, classId, actor);
  enforceRateLimit(`curriculum-upload:${actor.id}:${classId}`, 10);

  const { data: classRow, error: classError } = await supabase
    .from("classes")
    .select("grade,subject,unit")
    .eq("id", classId)
    .maybeSingle();
  if (classError) throw new ApiRequestError("datastore_error", 500);
  const grade = Number(classRow?.grade);
  const subject = typeof classRow?.subject === "string" ? classRow.subject.trim() : "";
  const unit = typeof classRow?.unit === "string" ? classRow.unit.trim() : "";
  if (!Number.isInteger(grade) || grade <= 0 || !subject || !unit) {
    throw new ApiRequestError("class_context_incomplete", 422);
  }

  const { data: selectedRows, error: selectedError } = await supabase
    .from("curriculum_source_selections")
    .select("source_id")
    .eq("class_id", classId)
    .limit(50);
  if (selectedError) throw new ApiRequestError("datastore_error", 500);
  if ((selectedRows ?? []).length >= 50) {
    throw new ApiRequestError("curriculum_selection_limit", 409);
  }

  const body = parseBody(createCurriculumUploadSchema, await readJsonBody(req));
  if (!body.contentType.toLowerCase().includes("pdf")) {
    throw new ApiRequestError("invalid_content_type", 422);
  }

  const sourceId = crypto.randomUUID();
  const safeFilename = sanitizeCurriculumFilename(body.filename);
  const storagePath = `${classId}/${sourceId}/${safeFilename}`;
  const sourceDocument = `class-${classId}-source-${sourceId}`;
  const bucket = process.env.CURRICULUM_BUCKET ?? DEFAULT_CURRICULUM_BUCKET;

  const { data: source, error: insertError } = await supabase
    .from("curriculum_sources")
    .insert({
      id: sourceId,
      origin_class_id: classId,
      uploaded_by: actor.id,
      grade,
      subject,
      unit,
      source_document: sourceDocument,
      original_filename: safeFilename,
      content_type: body.contentType,
      size_bytes: body.sizeBytes,
      storage_path: storagePath,
      status: "pending_upload",
    })
    .select("id,status,storage_path,source_document,original_filename,size_bytes,created_at")
    .single();

  if (insertError || !source) {
    safeLog("error", "curriculum.upload_create_failed", {
      classId,
      outcome: classifySafeError(insertError ?? new Error("missing source")),
    });
    throw new ApiRequestError("curriculum_source_create_failed", 500);
  }

  const { error: selectionError } = await supabase.from("curriculum_source_selections").insert({
    class_id: classId,
    source_id: sourceId,
    selected_by: actor.id,
  });
  if (selectionError) {
    await supabase.from("curriculum_sources").delete().eq("id", sourceId);
    throw new ApiRequestError("curriculum_selection_update_failed", 500);
  }

  const { data: signed, error: signedError } = await supabase.storage
    .from(bucket)
    .createSignedUploadUrl(storagePath);

  if (signedError || !signed?.signedUrl) {
    await supabase.from("curriculum_sources").delete().eq("id", sourceId);
    safeLog("error", "curriculum.signed_upload_failed", {
      classId,
      sourceId,
      outcome: classifySafeError(signedError ?? new Error("missing signed url")),
    });
    throw new ApiRequestError("curriculum_signed_url_failed", 500);
  }

  logApi("curriculum signed upload created", {
    classId,
    sourceId,
    sizeBytes: body.sizeBytes,
  });

  writeJson(res, 201, {
    sourceId: source.id,
    status: source.status,
    storagePath: source.storage_path,
    sourceDocument: source.source_document,
    bucket,
    upload: {
      signedUrl: signed.signedUrl,
      token: signed.token,
      path: signed.path ?? storagePath,
      expiresInSeconds: SIGNED_UPLOAD_TTL_SECONDS,
    },
  });
}

async function completeCurriculumUpload(
  req: IncomingMessage,
  res: ServerResponse,
  classId: string,
  supabase: SupabaseClient,
  actor: ApiActor,
  boss: PgBoss,
) {
  await authorizeClass(supabase, classId, actor);
  enforceRateLimit(`curriculum-complete:${actor.id}:${classId}`, 10);

  const { sourceId } = parseBody(completeCurriculumUploadSchema, await readJsonBody(req));
  const { data: source, error } = await supabase
    .from("curriculum_sources")
    .select("id,origin_class_id,status,storage_path,size_bytes")
    .eq("id", sourceId)
    .eq("origin_class_id", classId)
    .maybeSingle();

  if (error) throw new ApiRequestError("datastore_error", 500);
  if (!source) throw new ApiRequestError("curriculum_source_not_found", 404);

  if (source.status === "ready" || source.status === "processing") {
    writeJson(res, 200, { sourceId: source.id, status: source.status, enqueued: false });
    return;
  }

  const bucket = process.env.CURRICULUM_BUCKET ?? DEFAULT_CURRICULUM_BUCKET;
  const { error: probeError } = await supabase.storage
    .from(bucket)
    .createSignedUrl(source.storage_path, 60);
  if (probeError) {
    throw new ApiRequestError("curriculum_object_missing", 409);
  }

  const { error: updateError } = await supabase
    .from("curriculum_sources")
    .update({
      status: "uploaded",
      error_message: null,
      updated_at: new Date().toISOString(),
    })
    .eq("id", sourceId)
    .eq("origin_class_id", classId);

  if (updateError) throw new ApiRequestError("curriculum_source_update_failed", 500);

  try {
    await boss.send(
      JOB_INGEST_CURRICULUM_SOURCE,
      { sourceId, classId },
      { singletonKey: sourceId, singletonSeconds: 60 * 30 },
    );
  } catch (queueError) {
    safeLog("error", "curriculum.ingest_enqueue_failed", {
      classId,
      sourceId,
      outcome: classifySafeError(queueError),
    });
    throw new ApiRequestError("curriculum_ingest_enqueue_failed", 500);
  }

  logApi("curriculum ingest enqueued", { classId, sourceId });
  writeJson(res, 202, { sourceId, status: "uploaded", enqueued: true });
}

async function getCurriculumSource(
  res: ServerResponse,
  classId: string,
  sourceId: string,
  supabase: SupabaseClient,
  actor: ApiActor,
) {
  await authorizeClass(supabase, classId, actor);

  const { data, error } = await supabase
    .from("curriculum_sources")
    .select(
      "id,origin_class_id,source_document,original_filename,content_type,size_bytes,status,error_message,page_count,chunks_built,storage_deleted_at,created_at,updated_at",
    )
    .eq("id", sourceId)
    .eq("origin_class_id", classId)
    .maybeSingle();

  if (error) throw new ApiRequestError("datastore_error", 500);
  if (!data) throw new ApiRequestError("curriculum_source_not_found", 404);

  writeJson(res, 200, { source: data });
}

async function listCurriculumSources(
  res: ServerResponse,
  classId: string,
  supabase: SupabaseClient,
  actor: ApiActor,
) {
  await authorizeClass(supabase, classId, actor);

  const { data, error } = await supabase
    .from("curriculum_sources")
    .select(
      "id,origin_class_id,source_document,original_filename,content_type,size_bytes,status,error_message,page_count,chunks_built,storage_deleted_at,created_at,updated_at",
    )
    .eq("origin_class_id", classId)
    .order("created_at", { ascending: false })
    .limit(50);

  if (error) throw new ApiRequestError("datastore_error", 500);
  writeJson(res, 200, { sources: data ?? [] });
}

async function getCurriculumLibrary(
  res: ServerResponse,
  classId: string,
  supabase: SupabaseClient,
  actor: ApiActor,
) {
  await authorizeClass(supabase, classId, actor);

  const { data: classRow, error: classError } = await supabase
    .from("classes")
    .select("id,grade,subject,unit")
    .eq("id", classId)
    .maybeSingle();
  if (classError) throw new ApiRequestError("datastore_error", 500);
  if (!classRow) throw new ApiRequestError("class_not_found", 404);

  const grade = Number(classRow.grade);
  const subject = typeof classRow.subject === "string" ? classRow.subject.trim() : "";
  const unit = typeof classRow.unit === "string" ? classRow.unit.trim() : "";
  if (!Number.isInteger(grade) || grade <= 0 || !subject) {
    throw new ApiRequestError("class_context_incomplete", 422);
  }

  const fields =
    "id,origin_class_id,uploaded_by,original_filename,size_bytes,status,error_message,grade,subject,unit,page_count,chunks_built,storage_deleted_at,created_at,updated_at";
  const { data: readySources, error: readyError } = await supabase
    .from("curriculum_sources")
    .select(fields)
    .eq("grade", grade)
    .eq("subject", subject)
    .eq("status", "ready")
    .order("created_at", { ascending: false })
    .limit(100);
  if (readyError) throw new ApiRequestError("datastore_error", 500);

  const { data: ownPending, error: pendingError } = await supabase
    .from("curriculum_sources")
    .select(fields)
    .eq("uploaded_by", actor.id)
    .eq("grade", grade)
    .eq("subject", subject)
    .neq("status", "ready")
    .order("created_at", { ascending: false })
    .limit(20);
  if (pendingError) throw new ApiRequestError("datastore_error", 500);

  const selectedIds = new Set(await loadSelectedCurriculumSourceIds(supabase, classId));
  const byId = new Map<string, Record<string, unknown>>();
  for (const source of [...(readySources ?? []), ...(ownPending ?? [])]) {
    if (typeof source.id === "string") byId.set(source.id, source);
  }

  const sources = [...byId.values()]
    .sort((a, b) => String(b.created_at).localeCompare(String(a.created_at)))
    .map((source) => ({
      id: source.id,
      originalFilename: source.original_filename,
      sizeBytes: source.size_bytes,
      status: source.status,
      errorMessage: source.error_message,
      grade: source.grade,
      subject: source.subject,
      unit: source.unit,
      pageCount: source.page_count,
      chunksBuilt: source.chunks_built,
      storageDeletedAt: source.storage_deleted_at,
      createdAt: source.created_at,
      updatedAt: source.updated_at,
      isOwner: source.uploaded_by === actor.id,
      selected: typeof source.id === "string" && selectedIds.has(source.id),
    }));

  writeJson(res, 200, {
    classContext: { id: classId, grade, subject, unit },
    selectedSourceIds: [...selectedIds],
    sources,
  });
}

async function replaceCurriculumSelections(
  req: IncomingMessage,
  res: ServerResponse,
  classId: string,
  supabase: SupabaseClient,
  actor: ApiActor,
) {
  await authorizeClass(supabase, classId, actor);
  enforceRateLimit(`curriculum-selections:${actor.id}:${classId}`, 20);
  const { sourceIds } = parseBody(replaceCurriculumSelectionsSchema, await readJsonBody(req));

  const { error } = await supabase.rpc("replace_class_curriculum_selections", {
    p_class_id: classId,
    p_selected_by: actor.id,
    p_source_ids: sourceIds,
  });
  if (error) {
    safeLog("error", "curriculum.selection_replace_failed", {
      classId,
      outcome: classifySafeError(error),
    });
    throw new ApiRequestError("curriculum_selection_invalid", 422);
  }

  writeJson(res, 200, { classId, selectedSourceIds: sourceIds });
}

async function retrieveCurriculumForClass(
  req: IncomingMessage,
  res: ServerResponse,
  classId: string,
  supabase: SupabaseClient,
  actor: ApiActor,
) {
  await authorizeClass(supabase, classId, actor);
  enforceRateLimit(`curriculum-retrieve:${actor.id}:${classId}`, 30);

  const body = parseBody(retrieveCurriculumSchema, await readJsonBody(req));
  const { data: classRow, error } = await supabase
    .from("classes")
    .select("id,grade,subject,unit")
    .eq("id", classId)
    .maybeSingle();

  if (error) throw new ApiRequestError("datastore_error", 500);
  if (!classRow) throw new ApiRequestError("class_not_found", 404);

  const grade = Number(classRow.grade);
  const subject = typeof classRow.subject === "string" ? classRow.subject : "";
  const unit = typeof classRow.unit === "string" ? classRow.unit : undefined;
  if (!Number.isInteger(grade) || grade <= 0 || !subject) {
    throw new ApiRequestError("class_context_incomplete", 422);
  }

  let queryText = body.queryText?.trim() ?? "";
  if (!queryText) {
    queryText = buildCurriculumQueryText({
      topic: body.topic ?? unit ?? subject,
      objective_guess: body.objective,
      key_terms: body.keyTerms,
    });
  }

  const matches = await retrieveCurriculumMatches(supabase, {
    queryText,
    grade,
    subject,
    unit,
    sourceIds: await loadSelectedCurriculumSourceIds(supabase, classId),
    matchCount: body.matchCount,
  });

  writeJson(res, 200, {
    classId,
    grade,
    subject,
    unit,
    matchCount: matches.length,
    matches,
  });
}


export async function routeRequest(
  req: IncomingMessage,
  res: ServerResponse,
  supabase: SupabaseClient,
  boss?: PgBoss,
) {
  try {
    for (const [name, value] of Object.entries(corsHeaders(req))) res.setHeader?.(name, value);
    if (req.method === "OPTIONS") {
      handleOptions(req, res);
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

    const actor = await authenticate(req, supabase);

    if (req.method === "POST" && url.pathname === "/api/sessions") {
      await createSession(req, res, supabase, actor);
      return;
    }

    const audioChunkMatch = url.pathname.match(/^\/api\/sessions\/([^/]+)\/audio-chunks$/);
    if (req.method === "POST" && audioChunkMatch?.[1]) {
      const sessionId = parseBody(uuidSchema, audioChunkMatch[1]);
      await authorizeSession(supabase, sessionId, actor);
      enforceRateLimit(`audio:${actor.id}:${sessionId}`, 30);
      if (!boss) throw new ApiRequestError("background_queue_starting", 503);
      await uploadAudioChunk(req, res, url, sessionId, supabase, boss);
      return;
    }

    const manualLessonStateMatch = url.pathname.match(/^\/api\/sessions\/([^/]+)\/manual-lesson-state$/);
    if (req.method === "POST" && manualLessonStateMatch?.[1]) {
      const sessionId = parseBody(uuidSchema, manualLessonStateMatch[1]);
      await authorizeSession(supabase, sessionId, actor);
      await createManualLessonState(req, res, sessionId, supabase);
      return;
    }

    const activityCandidatesMatch = url.pathname.match(/^\/api\/sessions\/([^/]+)\/activity-candidates$/);
    if (req.method === "POST" && activityCandidatesMatch?.[1]) {
      const sessionId = parseBody(uuidSchema, activityCandidatesMatch[1]);
      await authorizeSession(supabase, sessionId, actor);
      // The web client polls this endpoint every 10 seconds while lesson_state is pending.
      enforceRateLimit(`generation:${actor.id}:${sessionId}`, 10);
      await createActivityCandidates(res, sessionId, supabase);
      return;
    }

    const curriculumUploadMatch = url.pathname.match(/^\/api\/classes\/([^/]+)\/curriculum\/uploads$/);
    if (req.method === "POST" && curriculumUploadMatch?.[1]) {
      const classId = parseBody(uuidSchema, curriculumUploadMatch[1]);
      await createCurriculumUploadUrl(req, res, classId, supabase, actor);
      return;
    }

    const curriculumCompleteMatch = url.pathname.match(/^\/api\/classes\/([^/]+)\/curriculum\/uploads\/complete$/);
    if (req.method === "POST" && curriculumCompleteMatch?.[1]) {
      const classId = parseBody(uuidSchema, curriculumCompleteMatch[1]);
      if (!boss) throw new ApiRequestError("background_queue_starting", 503);
      await completeCurriculumUpload(req, res, classId, supabase, actor, boss);
      return;
    }

    const curriculumSourceMatch = url.pathname.match(/^\/api\/classes\/([^/]+)\/curriculum\/sources\/([^/]+)$/);
    if (req.method === "GET" && curriculumSourceMatch?.[1] && curriculumSourceMatch[2]) {
      const classId = parseBody(uuidSchema, curriculumSourceMatch[1]);
      const sourceId = parseBody(uuidSchema, curriculumSourceMatch[2]);
      await getCurriculumSource(res, classId, sourceId, supabase, actor);
      return;
    }

    const curriculumSourcesMatch = url.pathname.match(/^\/api\/classes\/([^/]+)\/curriculum\/sources$/);
    if (req.method === "GET" && curriculumSourcesMatch?.[1]) {
      const classId = parseBody(uuidSchema, curriculumSourcesMatch[1]);
      await listCurriculumSources(res, classId, supabase, actor);
      return;
    }

    const curriculumLibraryMatch = url.pathname.match(/^\/api\/classes\/([^/]+)\/curriculum\/library$/);
    if (req.method === "GET" && curriculumLibraryMatch?.[1]) {
      const classId = parseBody(uuidSchema, curriculumLibraryMatch[1]);
      await getCurriculumLibrary(res, classId, supabase, actor);
      return;
    }

    const curriculumSelectionsMatch = url.pathname.match(/^\/api\/classes\/([^/]+)\/curriculum\/selections$/);
    if (req.method === "PUT" && curriculumSelectionsMatch?.[1]) {
      const classId = parseBody(uuidSchema, curriculumSelectionsMatch[1]);
      await replaceCurriculumSelections(req, res, classId, supabase, actor);
      return;
    }

    const curriculumRetrieveMatch = url.pathname.match(/^\/api\/classes\/([^/]+)\/curriculum\/retrieve$/);
    if (req.method === "POST" && curriculumRetrieveMatch?.[1]) {
      const classId = parseBody(uuidSchema, curriculumRetrieveMatch[1]);
      await retrieveCurriculumForClass(req, res, classId, supabase, actor);
      return;
    }

    writeJson(res, 404, { error: { code: "not_found" } });
  } catch (error) {
    const statusCode = error instanceof ApiRequestError ? error.statusCode : 500;
    const code = error instanceof ApiRequestError ? error.code : "internal_error";
    if (!(error instanceof ApiRequestError)) {
      safeLog("error", "api.request_failed", { outcome: classifySafeError(error) });
    }
    writeJson(res, statusCode, { error: { code } });
  }
}

export function startApiServer({ supabase, boss, getBoss }: ApiServerOptions) {
  const port = Number(process.env.PORT ?? process.env.API_PORT ?? 8787);
  const server = createServer((req, res) => {
    routeRequest(req, res, supabase, getBoss?.() ?? boss).catch((error: unknown) => {
      safeLog("error", "api.unhandled_request_failure", { outcome: classifySafeError(error) });
      writeJson(res, 500, { error: { code: "internal_error" } });
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
