import type { IncomingMessage, ServerResponse } from "node:http";
import type { SupabaseClient } from "@supabase/supabase-js";
import { retrieveCurriculumMatches } from "@kobi/curriculum";
import type PgBoss from "pg-boss";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { routeRequest } from "./api.js";
import { runGenerateActivityArtifactsJob } from "./jobs/generateActivityArtifacts.job.js";
import { silentLessonState } from "./silentLessonState.js";

vi.mock("@kobi/curriculum", async (importOriginal) => {
  const original = await importOriginal<typeof import("@kobi/curriculum")>();
  return {
    ...original,
    embedText: vi.fn(async () => Array.from({ length: 768 }, () => 0.01)),
    retrieveCurriculumMatches: vi.fn(async () => []),
  };
});

vi.mock("./jobs/generateActivityArtifacts.job.js", () => ({
  runGenerateActivityArtifactsJob: vi.fn(async () => ({
    inserted: 3,
    reused: 0,
    generated: 0,
    skippedReason: null,
  })),
}));

describe("worker API", () => {
  const originalOpenAiApiKey = process.env.OPENAI_API_KEY;
  const originalActivityModel = process.env.OPENAI_ACTIVITY_MODEL;

  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    restoreEnv("OPENAI_API_KEY", originalOpenAiApiKey);
    restoreEnv("OPENAI_ACTIVITY_MODEL", originalActivityModel);
  });

  it("returns 400 for malformed JSON request bodies", async () => {
    const req = fakeRawRequest("{not json");
    const res = fakeResponse();

    await routeRequest(req, res, fakeSupabase().client, fakeBoss().instance);

    expect(res.statusCode).toBe(400);
    expect(res.body).toEqual({ error: { code: "invalid_json" } });
  });

  it("allows PUT curriculum selection requests through CORS preflight", async () => {
    const req = fakeRawRequest("", { host: "localhost", origin: "http://localhost:5173" });
    req.method = "OPTIONS";
    const res = fakeResponse();

    await routeRequest(req, res, fakeSupabase().client, fakeBoss().instance);

    expect(res.statusCode).toBe(204);
    expect(res.headers["access-control-allow-methods"]).toContain("PUT");
  });

  it("returns 409 when activity candidates are requested before lesson_state exists", async () => {
    const response = await callRoute(
      `/api/sessions/${SESSION_ID}/activity-candidates`,
      fakeSupabase(),
      fakeBoss(),
      {},
    );

    expect(response.statusCode).toBe(409);
    expect(runGenerateActivityArtifactsJob).not.toHaveBeenCalled();
  });

  it("returns 409 when activity candidates are requested from a silence-only lesson state", async () => {
    const supabase = fakeSupabase();
    supabase.segments.push({
      session_id: SESSION_ID,
      lesson_state: silentLessonState,
      created_at: "2026-07-16T21:00:00.000Z",
    });

    const response = await callRoute(
      `/api/sessions/${SESSION_ID}/activity-candidates`,
      supabase,
      fakeBoss(),
      {},
    );

    expect(response.statusCode).toBe(409);
    expect(response.body).toEqual({
      error: "No spoken lesson content is available. Enter the topic manually before generating activities.",
    });
    expect(runGenerateActivityArtifactsJob).not.toHaveBeenCalled();
  });

  it("reports transcription completion only after the final lesson-state segment", async () => {
    const supabase = fakeSupabase();
    supabase.audioChunks.push(
      {
        session_id: SESSION_ID,
        chunk_index: 0,
        status: "transcribed",
        transcript_text: "Primer fragmento",
      },
      {
        session_id: SESSION_ID,
        chunk_index: 1,
        status: "transcribed",
        transcript_text: "Segundo fragmento",
      },
    );
    supabase.segments.push({
      session_id: SESSION_ID,
      source_through_chunk_index: null,
    });
    supabase.segments.push({
      session_id: SESSION_ID,
      source_through_chunk_index: 1,
    });

    const req = fakeRequest({});
    req.method = "GET";
    req.url = `/api/sessions/${SESSION_ID}/transcription-status?expected_chunks=2`;
    const res = fakeResponse();
    await routeRequest(req, res, supabase.client, fakeBoss().instance);

    expect(res.statusCode).toBe(200);
    expect(res.body).toEqual({
      expectedChunks: 2,
      uploaded: 2,
      pending: 0,
      transcribing: 0,
      transcribed: 2,
      spokenChunks: 2,
      terminalFailed: 0,
      lessonStateThroughChunkIndex: 1,
      complete: true,
    });
  });

  it("reports completed silence without counting it as spoken audio", async () => {
    const supabase = fakeSupabase();
    supabase.audioChunks.push({
      session_id: SESSION_ID,
      chunk_index: 0,
      status: "transcribed",
      transcript_text: "   ",
    });
    supabase.segments.push({
      session_id: SESSION_ID,
      source_through_chunk_index: 0,
    });

    const req = fakeRequest({});
    req.method = "GET";
    req.url = `/api/sessions/${SESSION_ID}/transcription-status?expected_chunks=1`;
    const res = fakeResponse();
    await routeRequest(req, res, supabase.client, fakeBoss().instance);

    expect(res.statusCode).toBe(200);
    expect(res.body).toMatchObject({
      transcribed: 1,
      spokenChunks: 0,
      complete: true,
    });
  });

  it("generates activity candidates on the worker from the latest lesson_state", async () => {
    process.env.OPENAI_API_KEY = "sk-test";
    process.env.OPENAI_ACTIVITY_MODEL = "gpt-activity-test";
    const supabase = fakeSupabase();
    supabase.segments.push({
      session_id: SESSION_ID,
      lesson_state: lessonState,
      created_at: "2026-07-07T10:00:00.000Z",
    });
    vi.mocked(retrieveCurriculumMatches).mockResolvedValueOnce([curriculumMatch]);

    const response = await callRoute(
      `/api/sessions/${SESSION_ID}/activity-candidates`,
      supabase,
      fakeBoss(),
      {},
    );

    expect(response.statusCode).toBe(201);
    expect(retrieveCurriculumMatches).toHaveBeenCalledWith(
      supabase.client,
      expect.objectContaining({ grade: 7, subject: "lenguaje", unit: "U4" }),
    );
    expect(runGenerateActivityArtifactsJob).toHaveBeenCalledWith(
      supabase.client,
      {
        sessionId: SESSION_ID,
        lessonState,
        curriculumMatches: [curriculumMatch],
      },
      { openAiGenerator: expect.any(Function) },
    );
  });

  it("returns 401 for anonymous and expired tokens", async () => {
    const anonymous = await callRoute(`/api/sessions/${SESSION_ID}/manual-lesson-state`, fakeSupabase(), fakeBoss(), {}, {});
    const expired = await callRoute(`/api/sessions/${SESSION_ID}/manual-lesson-state`, fakeSupabase(), fakeBoss(), {}, { authorization: "Bearer expired" });

    expect(anonymous.body).toEqual({ error: { code: "authentication_required" } });
    expect(expired.body).toEqual({ error: { code: "invalid_token" } });
    expect(anonymous.statusCode).toBe(401);
    expect(expired.statusCode).toBe(401);
  });

  it.each([
    ["session creation", "/api/sessions", { classId: CLASS_ID }],
    ["audio upload", `/api/sessions/${SESSION_ID}/audio-chunks`, {}],
    ["manual lesson state", `/api/sessions/${SESSION_ID}/manual-lesson-state`, {}],
    ["activity generation", `/api/sessions/${SESSION_ID}/activity-candidates`, {}],
  ])("returns 403 before privileged work for cross-teacher %s", async (_name, url, body) => {
    const supabase = fakeSupabase();
    supabase.classes[0]!.teacher_id = "44444444-4444-4444-8444-444444444444";
    (supabase.sessions[0]!.classes as Record<string, unknown>).teacher_id = "44444444-4444-4444-8444-444444444444";

    const response = await callRoute(url, supabase, fakeBoss(), body);

    expect(response.statusCode).toBe(403);
    expect(response.body).toEqual({ error: { code: "forbidden" } });
  });

  it("returns stable validation and missing-resource errors", async () => {
    const malformed = await callRoute("/api/sessions/not-a-uuid/activity-candidates", fakeSupabase(), fakeBoss(), {});
    const missing = await callRoute(`/api/sessions/${"55555555-5555-4555-8555-555555555555"}/activity-candidates`, fakeSupabase(), fakeBoss(), {});

    expect(malformed.body).toEqual({ error: { code: "invalid_request" } });
    expect(malformed.statusCode).toBe(422);
    expect(missing.body).toEqual({ error: { code: "session_not_found" } });
    expect(missing.statusCode).toBe(404);
  });
});

function restoreEnv(name: string, value: string | undefined) {
  if (value === undefined) delete process.env[name];
  else process.env[name] = value;
}

async function callRoute(
  url: string,
  supabase: ReturnType<typeof fakeSupabase>,
  boss: ReturnType<typeof fakeBoss>,
  body: Record<string, unknown>,
  headers?: Record<string, string>,
) {
  const req = fakeRequest(body, headers);
  req.url = url;
  const res = fakeResponse();
  await routeRequest(req, res, supabase.client, boss.instance);
  return res;
}

function fakeRequest(body: Record<string, unknown>, headers?: Record<string, string>) {
  const payload = Buffer.from(JSON.stringify(body));
  return fakeRawRequest(payload, headers);
}

function fakeRawRequest(payload: string | Buffer, headers?: Record<string, string>) {
  const body = Buffer.isBuffer(payload) ? payload : Buffer.from(payload);
  return {
    method: "POST",
    url: `/api/sessions/${SESSION_ID}/manual-lesson-state`,
    headers: headers ?? { host: "localhost", "content-type": "application/json", authorization: "Bearer valid-token" },
    async *[Symbol.asyncIterator]() {
      yield body;
    },
  } as unknown as IncomingMessage;
}

function fakeResponse() {
  return {
    statusCode: 0,
    body: null as unknown,
    headers: {} as Record<string, string>,
    writeHead(this: ApiTestResponse, statusCode: number, headers?: Record<string, string>) {
      this.statusCode = statusCode;
      this.headers = headers ?? {};
      return this;
    },
    end(this: ApiTestResponse, payload: string) {
      this.body = payload ? JSON.parse(payload) : null;
      return this;
    },
  } as unknown as ApiTestResponse;
}

type ApiTestResponse = ServerResponse & { statusCode: number; body: unknown; headers: Record<string, string> };

function fakeBoss() {
  const sent: Array<{ name: string; data: unknown }> = [];
  const instance = {
    send: async (name: string, data: unknown) => {
      sent.push({ name, data });
      return "job-id";
    },
  } as unknown as PgBoss;

  return { instance, sent };
}

function fakeSupabase() {
  const curriculumChunks: unknown[] = [];
  const audioChunks: Array<Record<string, unknown>> = [];
  const segments: Array<Record<string, unknown>> = [];
  const sessions: Array<Record<string, unknown>> = [
    {
      id: SESSION_ID,
      classes: { teacher_id: TEACHER_ID, grade: 7, subject: "lenguaje", unit: "U4" },
    },
  ];
  const classes: Array<Record<string, unknown>> = [{ id: CLASS_ID, teacher_id: TEACHER_ID }];

  const client = {
    auth: {
      getUser: vi.fn(async (token: string) => token === "valid-token"
        ? { data: { user: { id: TEACHER_ID } }, error: null }
        : { data: { user: null }, error: { message: "expired" } }),
    },
    from(table: string) {
      return new FakeQuery(table, { curriculumChunks, audioChunks, segments, sessions, classes });
    },
  } as unknown as SupabaseClient;

  return { client, curriculumChunks, audioChunks, segments, sessions, classes };
}

const TEACHER_ID = "11111111-1111-4111-8111-111111111111";
const CLASS_ID = "22222222-2222-4222-8222-222222222222";
const SESSION_ID = "33333333-3333-4333-8333-333333333333";

const lessonState = {
  topic: "La noticia",
  objective_guess: "Identificar titular, entradilla y fuente",
  key_terms: ["titular", "entradilla", "fuente"],
  transcript_summary: "La clase explico las partes de una noticia.",
  confidence: 0.9,
  evidence: {
    quoted_phrases: ["titular de la noticia"],
    reason: "La docente explico partes de la noticia.",
  },
};

const curriculumMatch = {
  objective_code: "L7.4.2",
  unit: "U4",
  grade: 7,
  subject: "lenguaje",
  text: "Reconoce la estructura de la noticia.",
  similarity: 0.91,
};

class FakeQuery {
  private filters = new Map<string, unknown>();
  private notNullFilters = new Set<string>();
  private pendingInsert: Record<string, unknown> | null = null;

  constructor(
    private readonly table: string,
    private readonly state: {
      curriculumChunks: unknown[];
      audioChunks: Array<Record<string, unknown>>;
      segments: Array<Record<string, unknown>>;
      sessions: Array<Record<string, unknown>>;
      classes: Array<Record<string, unknown>>;
    },
  ) {}

  select() {
    return this;
  }

  eq(column: string, value: unknown) {
    this.filters.set(column, value);
    return this;
  }

  not(column: string, operator: string, value: unknown) {
    if (operator === "is" && value === null) {
      this.notNullFilters.add(column);
    }
    return this;
  }

  order() {
    return this;
  }

  limit() {
    return this;
  }

  insert(value: Record<string, unknown>) {
    this.pendingInsert = value;
    if (this.table === "curriculum_chunks") {
      this.state.curriculumChunks.push(value);
      return Promise.resolve({ data: null, error: null });
    }
    return this;
  }

  maybeSingle() {
    if (this.table === "classes") {
      const match = this.state.classes.find((row) => row.id === this.filters.get("id"));
      return Promise.resolve({ data: match ?? null, error: null });
    }
    if (this.table === "audio_chunks") {
      const match = this.state.audioChunks.find((chunk) =>
        chunk.session_id === this.filters.get("session_id") &&
        chunk.chunk_index === this.filters.get("chunk_index"),
      );
      return Promise.resolve({ data: match ? { id: match.id } : null, error: null });
    }

    if (this.table === "segments") {
      const match = this.state.segments.find((segment) =>
        segment.session_id === this.filters.get("session_id") &&
        Array.from(this.notNullFilters).every((column) => segment[column] !== null),
      );
      return Promise.resolve({
        data: match
          ? {
              lesson_state: match.lesson_state,
              source_through_chunk_index: match.source_through_chunk_index,
            }
          : null,
        error: null,
      });
    }

    if (this.table === "sessions") {
      const match = this.state.sessions.find((session) => session.id === this.filters.get("id"));
      return Promise.resolve({ data: match ?? null, error: null });
    }

    return Promise.resolve({ data: null, error: null });
  }

  single() {
    if (this.table !== "audio_chunks" || !this.pendingInsert) {
      return Promise.resolve({ data: null, error: { message: `unexpected single on ${this.table}` } });
    }

    const row = { id: `audio-chunk-${this.state.audioChunks.length + 1}`, ...this.pendingInsert };
    this.state.audioChunks.push(row);
    return Promise.resolve({ data: { id: row.id }, error: null });
  }

  then<TResult1 = unknown, TResult2 = never>(
    onfulfilled?: ((value: { data: unknown[]; error: null }) => TResult1 | PromiseLike<TResult1>) | null,
    onrejected?: ((reason: unknown) => TResult2 | PromiseLike<TResult2>) | null,
  ) {
    if (this.table === "curriculum_chunks") {
      return Promise.resolve({ data: this.state.curriculumChunks, error: null }).then(onfulfilled, onrejected);
    }
    if (this.table === "audio_chunks") {
      const rows = this.state.audioChunks.filter((chunk) =>
        chunk.session_id === this.filters.get("session_id"),
      );
      return Promise.resolve({ data: rows, error: null }).then(onfulfilled, onrejected);
    }

    return Promise.resolve({ data: [], error: null }).then(onfulfilled, onrejected);
  }
}
