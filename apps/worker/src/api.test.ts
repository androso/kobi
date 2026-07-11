import type { IncomingMessage, ServerResponse } from "node:http";
import type { SupabaseClient } from "@supabase/supabase-js";
import { retrieveCurriculumMatches } from "@kobi/curriculum";
import type PgBoss from "pg-boss";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { routeRequest } from "./api.js";
import { JOB_BUILD_LESSON_STATE } from "./queue.js";
import { runGenerateActivityArtifactsJob } from "./jobs/generateActivityArtifacts.job.js";

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

describe("worker demo transcript API", () => {
  const originalMode = process.env.KOBI_PROJECT_MODE;

  beforeEach(() => {
    process.env.KOBI_PROJECT_MODE = "demo";
    vi.clearAllMocks();
  });

  afterEach(() => {
    process.env.KOBI_PROJECT_MODE = originalMode;
  });

  it("rejects demo chunks outside demo mode", async () => {
    process.env.KOBI_PROJECT_MODE = "live";

    const response = await callDemoRoute(fakeSupabase(), fakeBoss(), { chunk_index: 0 });

    expect(response.statusCode).toBe(403);
  });

  it("returns 400 for invalid chunk indexes", async () => {
    const response = await callDemoRoute(fakeSupabase(), fakeBoss(), { chunk_index: -1 });

    expect(response.statusCode).toBe(400);
  });

  it("returns 400 for malformed JSON request bodies", async () => {
    const req = fakeRawRequest("{not json");
    const res = fakeResponse();

    await routeRequest(req, res, fakeSupabase().client, fakeBoss().instance);

    expect(res.statusCode).toBe(400);
    expect(res.body).toEqual({ error: "Request body must be valid JSON" });
  });

  it("inserts transcribed chunks idempotently and enqueues build-lesson-state once", async () => {
    const supabase = fakeSupabase();
    const boss = fakeBoss();

    const first = await callDemoRoute(supabase, boss, { chunk_index: 0 });
    const second = await callDemoRoute(supabase, boss, { chunk_index: 0 });

    expect(first.statusCode).toBe(201);
    expect(second.statusCode).toBe(200);
    expect(first.body).toMatchObject({
      audioChunkId: "audio-chunk-1",
      chunkIndex: 0,
      done: false,
    });
    expect(second.body).toMatchObject({
      audioChunkId: "audio-chunk-1",
      chunkIndex: 0,
      done: false,
    });
    expect(supabase.audioChunks).toEqual([
      expect.objectContaining({
        session_id: "session-1",
        chunk_index: 0,
        status: "transcribed",
        storage_path: "demo-transcript/session-1/0.txt",
        transcript_text: expect.stringContaining("Profesor:"),
      }),
    ]);
    expect(boss.sent).toEqual([{ name: JOB_BUILD_LESSON_STATE, data: { sessionId: "session-1" } }]);
  });

  it("returns 409 when activity candidates are requested before lesson_state exists", async () => {
    const response = await callRoute(
      "/api/sessions/session-1/activity-candidates",
      fakeSupabase(),
      fakeBoss(),
      {},
    );

    expect(response.statusCode).toBe(409);
    expect(runGenerateActivityArtifactsJob).not.toHaveBeenCalled();
  });

  it("generates activity candidates on the worker from the latest lesson_state", async () => {
    const supabase = fakeSupabase();
    supabase.segments.push({
      session_id: "session-1",
      lesson_state: lessonState,
      created_at: "2026-07-07T10:00:00.000Z",
    });
    vi.mocked(retrieveCurriculumMatches).mockResolvedValueOnce([curriculumMatch]);

    const response = await callRoute(
      "/api/sessions/session-1/activity-candidates",
      supabase,
      fakeBoss(),
      {},
    );

    expect(response.statusCode).toBe(201);
    expect(retrieveCurriculumMatches).toHaveBeenCalledWith(
      supabase.client,
      expect.objectContaining({ grade: 7, subject: "lenguaje", unit: "U4" }),
    );
    expect(runGenerateActivityArtifactsJob).toHaveBeenCalledWith(supabase.client, {
      sessionId: "session-1",
      lessonState,
      curriculumMatches: [curriculumMatch],
    });
  });
});

async function callDemoRoute(
  supabase: ReturnType<typeof fakeSupabase>,
  boss: ReturnType<typeof fakeBoss>,
  body: Record<string, unknown>,
) {
  return callRoute("/api/sessions/session-1/demo-transcript-chunks", supabase, boss, body);
}

async function callRoute(
  url: string,
  supabase: ReturnType<typeof fakeSupabase>,
  boss: ReturnType<typeof fakeBoss>,
  body: Record<string, unknown>,
) {
  const req = fakeRequest(body);
  req.url = url;
  const res = fakeResponse();
  await routeRequest(req, res, supabase.client, boss.instance);
  return res;
}

function fakeRequest(body: Record<string, unknown>) {
  const payload = Buffer.from(JSON.stringify(body));
  return fakeRawRequest(payload);
}

function fakeRawRequest(payload: string | Buffer) {
  const body = Buffer.isBuffer(payload) ? payload : Buffer.from(payload);
  return {
    method: "POST",
    url: "/api/sessions/session-1/demo-transcript-chunks",
    headers: { host: "localhost", "content-type": "application/json" },
    async *[Symbol.asyncIterator]() {
      yield body;
    },
  } as unknown as IncomingMessage;
}

function fakeResponse() {
  return {
    statusCode: 0,
    body: null as unknown,
    writeHead(this: ApiTestResponse, statusCode: number) {
      this.statusCode = statusCode;
      return this;
    },
    end(this: ApiTestResponse, payload: string) {
      this.body = payload ? JSON.parse(payload) : null;
      return this;
    },
  } as unknown as ApiTestResponse;
}

type ApiTestResponse = ServerResponse & { statusCode: number; body: unknown };

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
      id: "session-1",
      classes: { grade: 7, subject: "lenguaje", unit: "U4" },
    },
  ];

  const client = {
    from(table: string) {
      return new FakeQuery(table, { curriculumChunks, audioChunks, segments, sessions });
    },
  } as unknown as SupabaseClient;

  return { client, curriculumChunks, audioChunks, segments, sessions };
}

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
  private pendingInsert: Record<string, unknown> | null = null;

  constructor(
    private readonly table: string,
    private readonly state: {
      curriculumChunks: unknown[];
      audioChunks: Array<Record<string, unknown>>;
      segments: Array<Record<string, unknown>>;
      sessions: Array<Record<string, unknown>>;
    },
  ) {}

  select() {
    return this;
  }

  eq(column: string, value: unknown) {
    this.filters.set(column, value);
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
    if (this.table === "audio_chunks") {
      const match = this.state.audioChunks.find((chunk) =>
        chunk.session_id === this.filters.get("session_id") &&
        chunk.chunk_index === this.filters.get("chunk_index"),
      );
      return Promise.resolve({ data: match ? { id: match.id } : null, error: null });
    }

    if (this.table === "segments") {
      const match = this.state.segments.find((segment) =>
        segment.session_id === this.filters.get("session_id"),
      );
      return Promise.resolve({ data: match ? { lesson_state: match.lesson_state } : null, error: null });
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

    return Promise.resolve({ data: [], error: null }).then(onfulfilled, onrejected);
  }
}
