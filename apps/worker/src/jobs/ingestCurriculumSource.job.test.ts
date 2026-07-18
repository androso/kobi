import { beforeEach, describe, expect, it, vi } from "vitest";
import { digestTextbookPdf } from "@kobi/curriculum";
import { runIngestCurriculumSourceJob } from "./ingestCurriculumSource.job.js";

vi.mock("@kobi/curriculum", async (importOriginal) => {
  const original = await importOriginal<typeof import("@kobi/curriculum")>();
  return {
    ...original,
    digestTextbookPdf: vi.fn(),
  };
});

describe("ingestCurriculumSource job", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("downloads storage bytes, digests, and marks the source ready", async () => {
    vi.mocked(digestTextbookPdf).mockResolvedValueOnce({
      sourceDocument: "source-1",
      pageCount: 4,
      pagesRead: 4,
      pagesWithText: 4,
      textCoverage: 1,
      chunksBuilt: 3,
      inserted: 3,
      dryRun: false,
      units: ["U4"],
    });

    const updates: Array<Record<string, unknown>> = [];
    const download = vi.fn(async () => ({
      data: new Blob([new Uint8Array([0x25, 0x50, 0x44, 0x46])]),
      error: null,
    }));
    const remove = vi.fn(async () => ({ data: [], error: null }));

    const supabase = {
      from(table: string) {
        if (table !== "curriculum_sources") throw new Error(`unexpected table ${table}`);
        return {
          select() {
            return this;
          },
          eq() {
            return this;
          },
          maybeSingle: async () => ({
            data: {
              id: "source-1",
              origin_class_id: "class-1",
              source_document: "source-1",
              storage_path: "class-1/source-1/file.pdf",
              status: "uploaded",
              size_bytes: 4,
              grade: 7,
              subject: "lenguaje",
              unit: "U4",
              chunks_built: null,
            },
            error: null,
          }),
          update(value: Record<string, unknown>) {
            updates.push(value);
            return {
              error: null,
              eq() {
                return this;
              },
              neq() {
                return this;
              },
            };
          },
        };
      },
      storage: {
        from() {
          return { download, remove };
        },
      },
    };

    const result = await runIngestCurriculumSourceJob(supabase as never, {
      sourceId: "source-1",
      classId: "class-1",
    });

    expect(result).toEqual({ inserted: 3, chunksBuilt: 3 });
    expect(download).toHaveBeenCalledWith("class-1/source-1/file.pdf");
    expect(digestTextbookPdf).toHaveBeenCalledWith(
      supabase,
      expect.objectContaining({
        sourceId: "source-1",
        grade: 7,
        subject: "lenguaje",
        unit: "U4",
        sourceDocument: "source-1",
        replaceSource: true,
        maxPages: 400,
      }),
    );
    expect(remove).toHaveBeenCalledWith(["class-1/source-1/file.pdf"]);
    expect(updates).toEqual([
      expect.objectContaining({ status: "processing" }),
      expect.objectContaining({ status: "cleanup_pending", page_count: 4, chunks_built: 3 }),
      expect.objectContaining({ status: "ready", storage_deleted_at: expect.any(String) }),
    ]);
  });

  it("marks the source failed when digest throws", async () => {
    vi.mocked(digestTextbookPdf).mockRejectedValueOnce(new Error("OCR_REQUIRED"));

    const updates: Array<Record<string, unknown>> = [];
    const supabase = {
      from() {
        return {
          select() {
            return this;
          },
          eq() {
            return this;
          },
          maybeSingle: async () => ({
            data: {
              id: "source-1",
              origin_class_id: "class-1",
              source_document: "source-1",
              storage_path: "class-1/source-1/file.pdf",
              status: "uploaded",
              size_bytes: 4,
              grade: 7,
              subject: "lenguaje",
              unit: "U4",
              chunks_built: null,
            },
            error: null,
          }),
          update(value: Record<string, unknown>) {
            updates.push(value);
            return {
              error: null,
              eq() {
                return this;
              },
            };
          },
        };
      },
      storage: {
        from() {
          return {
            download: async () => ({
              data: new Blob([new Uint8Array([0x25, 0x50, 0x44, 0x46])]),
              error: null,
            }),
          };
        },
      },
    };

    await expect(
      runIngestCurriculumSourceJob(supabase as never, {
        sourceId: "source-1",
        classId: "class-1",
      }),
    ).rejects.toThrow(/OCR_REQUIRED/);

    expect(updates).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ status: "processing" }),
        expect.objectContaining({ status: "failed", error_message: "OCR_REQUIRED" }),
      ]),
    );
  });
});
