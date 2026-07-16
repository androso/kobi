import type { IncomingMessage, ServerResponse } from "node:http";
import type { SupabaseClient } from "@supabase/supabase-js";
import { retrieveCurriculumMatches } from "@kobi/curriculum";
import type PgBoss from "pg-boss";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { routeRequest } from "./api.js";
import { JOB_INGEST_CURRICULUM_SOURCE } from "./queue.js";

vi.mock("@kobi/curriculum", async (importOriginal) => {
  const original = await importOriginal<typeof import("@kobi/curriculum")>();
  return {
    ...original,
    retrieveCurriculumMatches: vi.fn(async () => []),
  };
});

describe("curriculum upload and retrieve API", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it("creates a signed upload URL for an owned class", async () => {
    const supabase = fakeSupabase();
    const boss = fakeBoss();

    const response = await callRoute(
      `/api/classes/${CLASS_ID}/curriculum/uploads`,
      supabase,
      boss,
      {
        filename: "Unidad 4.pdf",
        contentType: "application/pdf",
        sizeBytes: 12_345,
      },
    );

    expect(response.statusCode).toBe(201);
    expect(response.body).toMatchObject({
      status: "pending_upload",
      bucket: "curriculum-sources",
      upload: {
        signedUrl: "https://storage.example/upload",
        token: "upload-token",
      },
    });
    expect(supabase.curriculumSources).toHaveLength(1);
    const source = supabase.curriculumSources[0]!;
    expect(supabase.curriculumSources[0]).toMatchObject({
      origin_class_id: CLASS_ID,
      uploaded_by: TEACHER_ID,
      grade: 7,
      subject: "lenguaje",
      unit: "U4",
      status: "pending_upload",
      original_filename: "Unidad-4.pdf",
      size_bytes: 12_345,
      source_document: `class-${CLASS_ID}-source-${source.id}`,
    });
  });

  it("assigns a distinct source document to each class upload", async () => {
    const supabase = fakeSupabase();
    const boss = fakeBoss();

    for (const filename of ["Unidad 3.pdf", "Unidad 4.pdf"]) {
      const response = await callRoute(
        `/api/classes/${CLASS_ID}/curriculum/uploads`,
        supabase,
        boss,
        {
          filename,
          contentType: "application/pdf",
          sizeBytes: 12_345,
        },
      );
      expect(response.statusCode).toBe(201);
    }

    expect(supabase.curriculumSources).toHaveLength(2);
    const sourceDocuments = supabase.curriculumSources.map((source) => source.source_document);
    expect(new Set(sourceDocuments).size).toBe(2);
    for (const source of supabase.curriculumSources) {
      expect(source.source_document).toBe(`class-${CLASS_ID}-source-${source.id}`);
    }
  });

  it("rejects non-pdf content types before creating a source row", async () => {
    const supabase = fakeSupabase();
    const response = await callRoute(
      `/api/classes/${CLASS_ID}/curriculum/uploads`,
      supabase,
      fakeBoss(),
      {
        filename: "notes.txt",
        contentType: "text/plain",
        sizeBytes: 100,
      },
    );

    expect(response.statusCode).toBe(422);
    expect(response.body).toEqual({ error: { code: "invalid_content_type" } });
    expect(supabase.curriculumSources).toHaveLength(0);
  });

  it("enqueues ingest after a completed upload", async () => {
    const supabase = fakeSupabase();
    const boss = fakeBoss();
    const sourceId = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
    supabase.curriculumSources.push({
      id: sourceId,
      origin_class_id: CLASS_ID,
      status: "pending_upload",
      storage_path: `${CLASS_ID}/${sourceId}/unidad-4.pdf`,
      size_bytes: 100,
    });

    const response = await callRoute(
      `/api/classes/${CLASS_ID}/curriculum/uploads/complete`,
      supabase,
      boss,
      { sourceId },
    );

    expect(response.statusCode).toBe(202);
    expect(response.body).toEqual({
      sourceId,
      status: "uploaded",
      enqueued: true,
    });
    expect(supabase.curriculumSources[0]).toMatchObject({ status: "uploaded" });
    expect(boss.sent).toEqual([
      {
        name: JOB_INGEST_CURRICULUM_SOURCE,
        data: { sourceId, classId: CLASS_ID },
      },
    ]);
  });

  it("retrieves curriculum matches for a class", async () => {
    const supabase = fakeSupabase();
    vi.mocked(retrieveCurriculumMatches).mockResolvedValueOnce([curriculumMatch]);

    const response = await callRoute(
      `/api/classes/${CLASS_ID}/curriculum/retrieve`,
      supabase,
      fakeBoss(),
      {
        topic: "La noticia",
        objective: "Identificar titular y fuente",
        keyTerms: ["titular", "fuente"],
      },
    );

    expect(response.statusCode).toBe(200);
    expect(retrieveCurriculumMatches).toHaveBeenCalledWith(
      supabase.client,
      expect.objectContaining({
        grade: 7,
        subject: "lenguaje",
        unit: "U4",
        sourceIds: [],
      }),
    );
    expect(response.body).toMatchObject({
      classId: CLASS_ID,
      matchCount: 1,
      matches: [curriculumMatch],
    });
  });

  it("returns 403 for cross-teacher curriculum upload", async () => {
    const supabase = fakeSupabase();
    supabase.classes[0]!.teacher_id = "44444444-4444-4444-8444-444444444444";

    const response = await callRoute(
      `/api/classes/${CLASS_ID}/curriculum/uploads`,
      supabase,
      fakeBoss(),
      {
        filename: "unidad.pdf",
        contentType: "application/pdf",
        sizeBytes: 100,
      },
    );

    expect(response.statusCode).toBe(403);
    expect(response.body).toEqual({ error: { code: "forbidden" } });
  });

  it("lists compatible ready sources from the shared library", async () => {
    const supabase = fakeSupabase();
    supabase.curriculumSources.push({
      id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
      origin_class_id: null,
      uploaded_by: "44444444-4444-4444-8444-444444444444",
      original_filename: "Comprension-lectora.pdf",
      size_bytes: 2048,
      status: "ready",
      grade: 7,
      subject: "lenguaje",
      unit: "U3",
      page_count: 8,
      chunks_built: 12,
      storage_deleted_at: "2026-07-15T10:00:00.000Z",
      created_at: "2026-07-15T10:00:00.000Z",
      updated_at: "2026-07-15T10:00:00.000Z",
    });

    const response = await callRoute(
      `/api/classes/${CLASS_ID}/curriculum/library`,
      supabase,
      fakeBoss(),
      {},
      undefined,
      "GET",
    );

    expect(response.statusCode).toBe(200);
    expect(response.body).toMatchObject({
      classContext: { id: CLASS_ID, grade: 7, subject: "lenguaje", unit: "U4" },
      sources: [
        expect.objectContaining({
          originalFilename: "Comprension-lectora.pdf",
          isOwner: false,
          status: "ready",
        }),
      ],
    });
  });

  it("replaces the class source selection atomically", async () => {
    const supabase = fakeSupabase();
    const sourceIds = ["aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa"];
    const response = await callRoute(
      `/api/classes/${CLASS_ID}/curriculum/selections`,
      supabase,
      fakeBoss(),
      { sourceIds },
      undefined,
      "PUT",
    );

    expect(response.statusCode).toBe(200);
    expect(supabase.rpc).toHaveBeenCalledWith("replace_class_curriculum_selections", {
      p_class_id: CLASS_ID,
      p_selected_by: TEACHER_ID,
      p_source_ids: sourceIds,
    });
  });
});

const TEACHER_ID = "11111111-1111-4111-8111-111111111111";
const CLASS_ID = "22222222-2222-4222-8222-222222222222";

const curriculumMatch = {
  objective_code: "L7.4.2",
  unit: "U4",
  grade: 7,
  subject: "lenguaje",
  text: "Reconoce la estructura de la noticia.",
  similarity: 0.91,
};

interface FakeBoss {
  instance: PgBoss;
  sent: Array<{ name: string; data: unknown }>;
}

interface FakeSupabaseState {
  client: SupabaseClient;
  curriculumSources: Array<Record<string, unknown>>;
  classes: Array<Record<string, unknown>>;
  rpc: ReturnType<typeof vi.fn>;
}

interface ApiTestResponse extends ServerResponse {
  statusCode: number;
  body: unknown;
}

async function callRoute(
  url: string,
  supabase: FakeSupabaseState,
  boss: FakeBoss,
  body: Record<string, unknown>,
  headers?: Record<string, string>,
  method = "POST",
) {
  const req = fakeRequest(body, headers, method);
  req.url = url;
  const res = fakeResponse();
  await routeRequest(req, res, supabase.client, boss.instance);
  return res;
}

function fakeRequest(body: Record<string, unknown>, headers?: Record<string, string>, method = "POST") {
  const payload = Buffer.from(JSON.stringify(body));
  return {
    method,
    url: "/",
    headers: headers ?? {
      host: "localhost",
      "content-type": "application/json",
      authorization: "Bearer valid-token",
    },
    async *[Symbol.asyncIterator]() {
      yield payload;
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

function fakeBoss(): FakeBoss {
  const sent: Array<{ name: string; data: unknown }> = [];
  const instance = {
    send: async (name: string, data: unknown) => {
      sent.push({ name, data });
      return "job-id";
    },
  } as unknown as PgBoss;
  return { instance, sent };
}

function fakeSupabase(): FakeSupabaseState {
  const curriculumSources: Array<Record<string, unknown>> = [];
  const classes: Array<Record<string, unknown>> = [
    {
      id: CLASS_ID,
      teacher_id: TEACHER_ID,
      grade: 7,
      subject: "lenguaje",
      unit: "U4",
    },
  ];
  const rpc = vi.fn(async () => ({ data: 1, error: null }));

  const client = {
    rpc,
    auth: {
      getUser: vi.fn(async (token: string) =>
        token === "valid-token"
          ? { data: { user: { id: TEACHER_ID } }, error: null }
          : { data: { user: null }, error: { message: "expired" } },
      ),
    },
    storage: {
      from() {
        return {
          createSignedUploadUrl: async () => ({
            data: {
              signedUrl: "https://storage.example/upload",
              token: "upload-token",
              path: "signed-path",
            },
            error: null,
          }),
          createSignedUrl: async () => ({
            data: { signedUrl: "https://storage.example/object" },
            error: null,
          }),
        };
      },
    },
    from(table: string) {
      return new FakeQuery(table, { curriculumSources, classes });
    },
  } as unknown as SupabaseClient;

  return { client, curriculumSources, classes, rpc };
}

class FakeQuery {
  private filters = new Map<string, unknown>();
  private pendingInsert: Record<string, unknown> | null = null;
  private pendingUpdate: Record<string, unknown> | null = null;

  constructor(
    private readonly table: string,
    private readonly state: {
      curriculumSources: Array<Record<string, unknown>>;
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

  order() {
    return this;
  }

  neq() {
    return this;
  }

  limit() {
    return this;
  }

  insert(value: Record<string, unknown>) {
    this.pendingInsert = value;
    return this;
  }

  update(value: Record<string, unknown>) {
    this.pendingUpdate = value;
    return this;
  }

  delete() {
    return this;
  }

  maybeSingle() {
    if (this.table === "classes") {
      const match = this.state.classes.find((row) => row.id === this.filters.get("id"));
      return Promise.resolve({ data: match ?? null, error: null });
    }

    if (this.table === "curriculum_sources") {
      const match = this.state.curriculumSources.find((row) => {
        const idOk = !this.filters.has("id") || row.id === this.filters.get("id");
        const classOk =
          !this.filters.has("origin_class_id") ||
          row.origin_class_id === this.filters.get("origin_class_id");
        return idOk && classOk;
      });
      return Promise.resolve({ data: match ?? null, error: null });
    }

    return Promise.resolve({ data: null, error: null });
  }

  single() {
    if (this.table === "curriculum_sources" && this.pendingInsert) {
      const row = {
        id: this.pendingInsert.id ?? `source-${this.state.curriculumSources.length + 1}`,
        ...this.pendingInsert,
      };
      this.state.curriculumSources.push(row);
      return Promise.resolve({ data: row, error: null });
    }

    return Promise.resolve({
      data: null,
      error: { message: `unexpected single on ${this.table}` },
    });
  }

  then<TResult1 = unknown, TResult2 = never>(
    onfulfilled?:
      | ((value: { data: unknown; error: null }) => TResult1 | PromiseLike<TResult1>)
      | null,
    onrejected?: ((reason: unknown) => TResult2 | PromiseLike<TResult2>) | null,
  ) {
    if (this.table === "curriculum_sources" && this.pendingUpdate) {
      const match = this.state.curriculumSources.find((row) => {
        const idOk = !this.filters.has("id") || row.id === this.filters.get("id");
        const classOk =
          !this.filters.has("origin_class_id") ||
          row.origin_class_id === this.filters.get("origin_class_id");
        return idOk && classOk;
      });
      if (match) Object.assign(match, this.pendingUpdate);
      return Promise.resolve({ data: match ?? null, error: null }).then(onfulfilled, onrejected);
    }

    if (this.table === "curriculum_sources") {
      return Promise.resolve({ data: this.state.curriculumSources, error: null }).then(
        onfulfilled,
        onrejected,
      );
    }

    return Promise.resolve({ data: null, error: null }).then(onfulfilled, onrejected);
  }
}
