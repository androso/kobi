import { describe, expect, it, vi } from "vitest";
import { replaceCurriculumSource } from "./replaceCurriculumSource.js";
import type { CurriculumChunkRow } from "./types.js";

function makeRow(overrides: Partial<CurriculumChunkRow> = {}): CurriculumChunkRow {
  return {
    grade: 7,
    subject: "lenguaje",
    unit: "U4",
    objective_code: "L7.4.P1.C1",
    text: "La noticia tiene titular, entradilla y fuente.",
    class_id: "class-1",
    source_document: "source-1",
    source_page_start: 1,
    source_page_end: 1,
    section_title: "La noticia",
    chunk_index: 0,
    content_hash: "a".repeat(64),
    embedding: Array.from({ length: 768 }, () => 0.1),
    ...overrides,
  };
}

describe("replaceCurriculumSource", () => {
  it("rejects empty batches and bad embeddings before writing", async () => {
    const supabase = {
      rpc: vi.fn(),
    };

    await expect(
      replaceCurriculumSource(supabase as never, {
        sourceDocument: "source-1",
        rows: [],
      }),
    ).rejects.toThrow(/must not be empty/);

    await expect(
      replaceCurriculumSource(supabase as never, {
        sourceDocument: "source-1",
        rows: [makeRow({ embedding: [1, 2, 3] })],
      }),
    ).rejects.toThrow(/768 dimensions/);

    expect(supabase.rpc).not.toHaveBeenCalled();
  });

  it("sends the full prepared batch through the atomic replacement RPC", async () => {
    const rpc = vi.fn(async () => ({ data: 2, error: null }));

    const rows = [makeRow(), makeRow({ content_hash: "b".repeat(64), chunk_index: 1 })];
    const inserted = await replaceCurriculumSource({ rpc } as never, {
      sourceId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
      sourceDocument: "source-1",
      rows,
    });

    expect(inserted).toBe(2);
    expect(rpc).toHaveBeenCalledWith(
      "replace_curriculum_source",
      expect.objectContaining({
        p_source_id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
        p_class_id: null,
        p_source_document: "source-1",
        p_rows: expect.arrayContaining([
          expect.objectContaining({ content_hash: "a".repeat(64), source_id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa" }),
          expect.objectContaining({ content_hash: "b".repeat(64), source_id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa" }),
        ]),
      }),
    );
  });
});
