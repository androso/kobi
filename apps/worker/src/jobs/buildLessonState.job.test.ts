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

  it("advances through the next two contiguous transcripts", async () => {
    const insertedSegments: Array<Record<string, unknown>> = [];
    const supabase = fakeSupabase({
      previousLessonState: { topic: "Introduccion" },
      previousProgress: 0,
      chunks: [
        { chunk_index: 1, transcript_text: "Primer fragmento nuevo" },
        { chunk_index: 2, transcript_text: "Segundo fragmento nuevo" },
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

  it("does not jump lesson-state progress across a missing chunk", async () => {
    const insertedSegments: Array<Record<string, unknown>> = [];
    const supabase = fakeSupabase({
      previousLessonState: { topic: "Introduccion" },
      previousProgress: 0,
      chunks: [
        { chunk_index: 8, transcript_text: "Fragmento ocho" },
        { chunk_index: 9, transcript_text: "Fragmento nueve" },
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
  chunks: Array<{ chunk_index: number; transcript_text: string | null }>;
  insertedSegments: Array<Record<string, unknown>>;
}) {
  return {
    from(table: string) {
      if (table === "audio_chunks") {
        const query = {
          select: () => query,
          eq: () => query,
          gte: (_column: string, value: number) => {
            expect(value).toBe((previousProgress ?? -1) + 1);
            return query;
          },
          order: (_column: string, options: { ascending: boolean }) => {
            expect(options).toEqual({ ascending: true });
            return query;
          },
          limit: async () => ({ data: chunks, error: null }),
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
