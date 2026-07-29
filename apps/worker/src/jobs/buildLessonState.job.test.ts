import type { SupabaseClient } from "@supabase/supabase-js";
import type PgBoss from "pg-boss";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { buildLessonState } from "@kobi/ai-core";
import { registerBuildLessonStateJob, resolveLessonStateClassContext } from "./buildLessonState.job.js";
import { JOB_EVALUATE_CHECKPOINT } from "../queue.js";

vi.mock("@kobi/ai-core", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@kobi/ai-core")>()),
  buildLessonState: vi.fn(),
}));

describe("buildLessonState job", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(buildLessonState).mockResolvedValue({
      topic: "La noticia",
      objective_guess: "Identificar sus partes",
      key_terms: ["titular"],
      transcript_summary: "La docente explico la noticia.",
      confidence: 0.9,
      evidence: { quoted_phrases: ["titular"], reason: "Contenido claro." },
    });
  });

  it("advances through the next contiguous transcripts", async () => {
    const insertedSegments: Array<Record<string, unknown>> = [];
    const supabase = fakeSupabase({
      previousLessonState: { topic: "Introduccion" },
      previousProgress: 0,
      chunks: [
        { chunk_index: 1, status: "transcribed", transcript_text: "Primer fragmento nuevo" },
        { chunk_index: 2, status: "transcribed", transcript_text: "Segundo fragmento nuevo" },
      ],
      insertedSegments,
    });

    await registerBuildLessonStateJob(fakeBoss(), supabase);

    expect(insertedSegments[0]).toMatchObject({
      session_id: "session-1",
      source_through_chunk_index: 2,
    });
    expect(buildLessonState).toHaveBeenCalledWith({
      transcriptText: "Primer fragmento nuevo\nSegundo fragmento nuevo",
      classContext: { grade: 2, subject: "matemática" },
      previousLessonState: { topic: "Introduccion" },
    });
  });

  it("drains every contiguous transcript after an earlier gap closes", async () => {
    const insertedSegments: Array<Record<string, unknown>> = [];
    const supabase = fakeSupabase({
      previousLessonState: { topic: "Introduccion" },
      previousProgress: 0,
      chunks: Array.from({ length: 9 }, (_, index) => ({
        chunk_index: index + 1,
        status: "transcribed" as const,
        transcript_text: `Fragmento ${index + 1}`,
      })),
      insertedSegments,
    });

    await registerBuildLessonStateJob(fakeBoss(), supabase);

    expect(insertedSegments.map((segment) => segment.source_through_chunk_index)).toEqual([
      2,
      4,
      6,
      8,
      9,
    ]);
    expect(buildLessonState).toHaveBeenCalledTimes(5);
  });

  it("advances progress across silence without sending blank text to the model", async () => {
    const previousLessonState = {
      topic: "Introduccion",
      objective_guess: null,
      key_terms: [],
      transcript_summary: "Introduccion de la clase.",
      confidence: 0.7,
      evidence: { quoted_phrases: [], reason: "Estado previo." },
    };
    const insertedSegments: Array<Record<string, unknown>> = [];
    const supabase = fakeSupabase({
      previousLessonState,
      previousProgress: 0,
      chunks: [{ chunk_index: 1, status: "transcribed", transcript_text: "   " }],
      insertedSegments,
    });

    await registerBuildLessonStateJob(fakeBoss(), supabase);

    expect(buildLessonState).not.toHaveBeenCalled();
    expect(insertedSegments[0]).toMatchObject({
      lesson_state: previousLessonState,
      source_through_chunk_index: 1,
    });
  });

  it("advances past a terminal failure and incorporates later good transcripts", async () => {
    const insertedSegments: Array<Record<string, unknown>> = [];
    const supabase = fakeSupabase({
      previousLessonState: null,
      previousProgress: null,
      chunks: [
        { chunk_index: 0, status: "failed", transcript_text: null },
        { chunk_index: 1, status: "transcribed", transcript_text: "Contenido recuperado" },
      ],
      insertedSegments,
    });

    await registerBuildLessonStateJob(fakeBoss(), supabase);

    expect(buildLessonState).toHaveBeenCalledWith({
      transcriptText: "Contenido recuperado",
      classContext: { grade: 2, subject: "matemática" },
      previousLessonState: null,
    });
    expect(insertedSegments[0]).toMatchObject({
      source_through_chunk_index: 1,
    });
  });

  it("does not jump lesson-state progress across a missing chunk", async () => {
    const insertedSegments: Array<Record<string, unknown>> = [];
    const supabase = fakeSupabase({
      previousLessonState: { topic: "Introduccion" },
      previousProgress: 0,
      chunks: [
        { chunk_index: 8, status: "transcribed", transcript_text: "Fragmento ocho" },
        { chunk_index: 9, status: "transcribed", transcript_text: "Fragmento nueve" },
      ],
      insertedSegments,
    });

    await registerBuildLessonStateJob(fakeBoss(), supabase);

    expect(buildLessonState).not.toHaveBeenCalled();
    expect(insertedSegments).toEqual([]);
  });

  it("wakes the semantic checkpoint as soon as stable context is sufficient", async () => {
    const previousLessonState = {
      topic: "Figuras geométricas",
      objective_guess: "Identificar ángulos en triángulos y cuadriláteros",
      key_terms: ["ángulo", "triángulo", "cuadrilátero"],
      transcript_summary: "La docente identificó ángulos.",
      confidence: 0.82,
      evidence: { quoted_phrases: ["ángulo"], reason: "Contenido claro." },
    };
    vi.mocked(buildLessonState).mockResolvedValueOnce({
      ...previousLessonState,
      confidence: 0.88,
    });
    const boss = fakeBoss();
    await registerBuildLessonStateJob(
      boss,
      fakeSupabase({
        previousLessonState,
        previousProgress: 0,
        chunks: [{
          chunk_index: 1,
          status: "transcribed",
          transcript_text: "Ahora identifiquemos los ángulos de este triángulo.",
        }],
        insertedSegments: [],
      }),
    );

    expect(boss.send).toHaveBeenCalledWith(
      JOB_EVALUATE_CHECKPOINT,
      expect.objectContaining({ sessionId: "session-1", trigger: "context" }),
      {
        singletonKey: "session-1",
        singletonSeconds: 60,
        retryLimit: 3,
        retryDelay: 10,
        retryBackoff: true,
      },
    );
  });
});

function fakeBoss() {
  return {
    work: vi.fn(async (_name, _options, handler) => {
      await handler([{
        id: "job-1",
        data: { sessionId: "session-1", grade: 2, subject: "matemática" },
      }]);
      return "worker-1";
    }),
    send: vi.fn(async () => "checkpoint-job"),
  } as unknown as PgBoss;
}

function fakeSupabase({
  previousLessonState,
  previousProgress,
  chunks,
  insertedSegments,
}: {
  previousLessonState: unknown;
  previousProgress: number | null;
  chunks: Array<{
    chunk_index: number;
    status: "transcribed" | "failed";
    transcript_text: string | null;
  }>;
  insertedSegments: Array<Record<string, unknown>>;
}) {
  return {
    from(table: string) {
      if (table === "audio_chunks") {
        let requestedFrom = 0;
        const query = {
          select: () => query,
          eq: () => query,
          in: (_column: string, values: string[]) => {
            expect(values).toEqual(["transcribed", "failed"]);
            return query;
          },
          gte: (_column: string, value: number) => {
            requestedFrom = value;
            return query;
          },
          order: (_column: string, options: { ascending: boolean }) => {
            expect(options).toEqual({ ascending: true });
            return query;
          },
          limit: async (count: number) => ({
            data: chunks
              .filter((chunk) => chunk.chunk_index >= requestedFrom)
              .slice(0, count),
            error: null,
          }),
        };
        return query;
      }

      let selectedColumns = "";
      let pendingInsert: Record<string, unknown> | null = null;
      const query = {
        select: (columns: string) => {
          selectedColumns = columns;
          return query;
        },
        eq: () => query,
        not: () => query,
        order: () => query,
        limit: () => selectedColumns === "lesson_state"
          ? Promise.resolve({
              data: previousLessonState == null
                ? []
                : [{ lesson_state: previousLessonState }],
              error: null,
            })
          : query,
        maybeSingle: async () => {
          return {
            data: previousProgress === null
              ? null
              : { source_through_chunk_index: previousProgress },
            error: null,
          };
        },
        insert: (value: Record<string, unknown>) => {
          pendingInsert = value;
          return query;
        },
        single: async () => {
          insertedSegments.push(pendingInsert!);
          return { data: { id: "segment-1" }, error: null };
        },
      };
      return query;
    },
  } as unknown as SupabaseClient;
}

describe("resolveLessonStateClassContext", () => {
  it("uses explicit class context without querying Supabase", async () => {
    const from = () => {
      throw new Error("should not query");
    };
    await expect(resolveLessonStateClassContext({ from } as never, { sessionId: "session-1", grade: 2, subject: "matemática" }))
      .resolves.toEqual({ grade: 2, subject: "matemática" });
  });

  it("resolves missing context from the session class", async () => {
    const query = {
      select: () => query,
      eq: () => query,
      maybeSingle: async () => ({ data: { classes: { grade: 2, subject: "matemática" } }, error: null }),
    };
    await expect(resolveLessonStateClassContext({ from: () => query } as never, { sessionId: "session-1" }))
      .resolves.toEqual({ grade: 2, subject: "matemática" });
  });
});
