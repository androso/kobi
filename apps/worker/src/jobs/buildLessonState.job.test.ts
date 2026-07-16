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
    vi.mocked(buildLessonState).mockResolvedValue({
      topic: "La noticia",
      objective_guess: "Identificar sus partes",
      key_terms: ["titular"],
      transcript_summary: "La docente explico la noticia.",
      confidence: 0.9,
      evidence: { quoted_phrases: ["titular"], reason: "Contenido claro." },
    });
  });

  it("records the highest transcript chunk represented by the segment", async () => {
    const insertedSegments: Array<Record<string, unknown>> = [];
    const boss = {
      work: vi.fn(async (_name, _options, handler) => {
        await handler([{ id: "job-1", data: { sessionId: "session-1" } }]);
      }),
    } as unknown as PgBoss;
    const supabase = {
      from(table: string) {
        if (table === "audio_chunks") {
          const query = {
            select: () => query,
            eq: () => query,
            order: () => query,
            limit: async () => ({
              data: [
                { chunk_index: 4, transcript_text: "Segundo fragmento" },
                { chunk_index: 3, transcript_text: "Primer fragmento" },
              ],
              error: null,
            }),
          };
          return query;
        }

        let pendingInsert: Record<string, unknown> | null = null;
        const query = {
          select: () => query,
          eq: () => query,
          order: () => query,
          limit: () => query,
          maybeSingle: async () => ({ data: null, error: null }),
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

    await registerBuildLessonStateJob(boss, supabase);

    expect(insertedSegments[0]).toMatchObject({
      session_id: "session-1",
      source_through_chunk_index: 4,
    });
    expect(buildLessonState).toHaveBeenCalledWith(expect.objectContaining({
      transcriptText: "Primer fragmento\nSegundo fragmento",
    }));
  });
});
