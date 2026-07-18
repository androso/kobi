import type { SupabaseClient } from "@supabase/supabase-js";
import { describe, expect, it, vi } from "vitest";
import { embedText } from "./embedCurriculumChunk.js";
import { retrieveCurriculumMatches } from "./retrieveCurriculumMatches.js";

vi.mock("./embedCurriculumChunk.js", () => ({
  embedText: vi.fn(async () => Array.from({ length: 768 }, () => 0.1)),
}));

const matchRow = {
  source_id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
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
  it("queries exactly the selected shared sources", async () => {
    const rpc = vi.fn().mockResolvedValueOnce({ data: [matchRow], error: null });

    const matches = await retrieveCurriculumMatches({ rpc } as never as SupabaseClient, {
      queryText: "partes de la noticia",
      grade: 7,
      subject: "Lenguaje",
      unit: "U4",
      sourceIds: [
        "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
        "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
      ],
    });

    expect(matches).toHaveLength(1);
    expect(matches[0]).toMatchObject({ source_id: matchRow.source_id, similarity: 0.91 });
    expect(rpc).toHaveBeenCalledWith(
      "match_curriculum_chunks",
      expect.objectContaining({
        match_source_ids: [
          "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
          "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
        ],
        match_subject: "lenguaje",
      }),
    );
    expect(rpc).toHaveBeenCalledTimes(1);
  });

  it("deduplicates selected source ids", async () => {
    const rpc = vi.fn().mockResolvedValueOnce({ data: [matchRow], error: null });

    const matches = await retrieveCurriculumMatches({ rpc } as never as SupabaseClient, {
      queryText: "titular y fuente",
      grade: 7,
      subject: "lenguaje",
      unit: "U4",
      sourceIds: [matchRow.source_id, matchRow.source_id],
    });

    expect(matches).toHaveLength(1);
    expect(rpc).toHaveBeenCalledTimes(1);
    expect(rpc).toHaveBeenCalledWith(
      "match_curriculum_chunks",
      expect.objectContaining({ match_source_ids: [matchRow.source_id] }),
    );
  });

  it("omitted source ids queries curated defaults", async () => {
    const rpc = vi.fn().mockResolvedValueOnce({
      data: [{ ...matchRow, source_id: null, source_document: "seeded" }],
      error: null,
    });

    await retrieveCurriculumMatches({ rpc } as never as SupabaseClient, {
      queryText: "titular y fuente",
      grade: 7,
      subject: "lenguaje",
      unit: "U4",
    });

    expect(rpc).toHaveBeenCalledWith(
      "match_curriculum_chunks",
      expect.objectContaining({ match_source_ids: null, match_unit: "U4" }),
    );
    expect(rpc).toHaveBeenCalledTimes(1);
    expect(embedText).toHaveBeenCalledWith("titular y fuente", "RETRIEVAL_QUERY");
  });
});
