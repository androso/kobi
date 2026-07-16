import type { SupabaseClient } from "@supabase/supabase-js";
import { describe, expect, it, vi } from "vitest";
import { embedText } from "./embedCurriculumChunk.js";
import { retrieveCurriculumMatches } from "./retrieveCurriculumMatches.js";

vi.mock("./embedCurriculumChunk.js", () => ({
  embedText: vi.fn(async () => Array.from({ length: 768 }, () => 0.1)),
}));

const matchRow = {
  objective_code: "L7.4.P1.C1",
  unit: "U4",
  grade: 7,
  subject: "lenguaje",
  text: "La noticia tiene titular, entradilla y fuente.",
  source_document: "class-source",
  source_page_start: 1,
  source_page_end: 2,
  section_title: "La noticia",
  chunk_index: 0,
  similarity: 0.91,
};

describe("retrieveCurriculumMatches", () => {
  it("falls back to global seeded curriculum only when class-scoped matches are empty", async () => {
    const rpc = vi
      .fn()
      .mockResolvedValueOnce({ data: [], error: null })
      .mockResolvedValueOnce({ data: [{ ...matchRow, source_document: "seeded" }], error: null });

    const matches = await retrieveCurriculumMatches({ rpc } as never as SupabaseClient, {
      queryText: "partes de la noticia",
      grade: 7,
      subject: "Lenguaje",
      unit: "U4",
      classId: "11111111-1111-4111-8111-111111111111",
    });

    expect(matches).toHaveLength(1);
    expect(matches[0]).toMatchObject({ source_document: "seeded", similarity: 0.91 });
    expect(rpc).toHaveBeenNthCalledWith(
      1,
      "match_curriculum_chunks",
      expect.objectContaining({
        match_class_id: "11111111-1111-4111-8111-111111111111",
        match_subject: "lenguaje",
      }),
    );
    expect(rpc).toHaveBeenNthCalledWith(
      2,
      "match_curriculum_chunks",
      expect.objectContaining({ match_class_id: null }),
    );
  });

  it("does not call the global corpus when class-scoped rows match", async () => {
    const rpc = vi.fn().mockResolvedValueOnce({ data: [matchRow], error: null });

    const matches = await retrieveCurriculumMatches({ rpc } as never as SupabaseClient, {
      queryText: "titular y fuente",
      grade: 7,
      subject: "lenguaje",
      unit: "U4",
      classId: "11111111-1111-4111-8111-111111111111",
    });

    expect(matches).toHaveLength(1);
    expect(rpc).toHaveBeenCalledTimes(1);
  });

  it("omitted classId queries only the global corpus", async () => {
    const rpc = vi.fn().mockResolvedValueOnce({ data: [matchRow], error: null });

    await retrieveCurriculumMatches({ rpc } as never as SupabaseClient, {
      queryText: "titular y fuente",
      grade: 7,
      subject: "lenguaje",
      unit: "U4",
    });

    expect(rpc).toHaveBeenCalledWith(
      "match_curriculum_chunks",
      expect.objectContaining({ match_class_id: null }),
    );
    expect(rpc).toHaveBeenCalledTimes(1);
    expect(embedText).toHaveBeenCalledWith("titular y fuente", "RETRIEVAL_QUERY");
  });
});
