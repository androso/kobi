import type { SupabaseClient } from "@supabase/supabase-js";
import type PgBoss from "pg-boss";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { buildLessonState } from "@kobi/ai-core";
import { registerBuildLessonStateJob } from "./buildLessonState.job.js";

vi.mock("@kobi/ai-core", () => ({
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
});

function fakeBoss() {
  return {
    work: vi.fn(async (_name, _options, handler) => {
      await handler([{ id: "job-1", data: { sessionId: "session-1" } }]);
      return "worker-1";
    }),
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
        limit: () => query,
        maybeSingle: async () => {
          if (selectedColumns === "lesson_state") {
            return { data: { lesson_state: previousLessonState }, error: null };
          }
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
