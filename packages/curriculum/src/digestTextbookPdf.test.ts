import { describe, expect, it } from "vitest";
import {
  buildCurriculumChunksFromPages,
  normalizePdfText,
  type ExtractedPdfPage,
} from "./digestTextbookPdf.js";

describe("normalizePdfText", () => {
  it("normalizes whitespace without deleting paragraph boundaries", () => {
    expect(normalizePdfText("  Unidad 4   \r\n\r\n\r\n  La noticia\t\t y sus partes  \n")).toBe(
      "Unidad 4\n\nLa noticia y sus partes",
    );
  });
});

describe("buildCurriculumChunksFromPages", () => {
  it("detects units, sections, page ranges, and stable source metadata", async () => {
    const pages: ExtractedPdfPage[] = [
      {
        pageNumber: 12,
        text: [
          "Unidad 4",
          "",
          "La noticia",
          "",
          repeatedWords("titular entradilla cuerpo fuente", 40),
        ].join("\n"),
      },
      {
        pageNumber: 13,
        text: repeatedWords("lectura comprension noticia periodistica", 45),
      },
    ];

    const chunks = await buildCurriculumChunksFromPages(pages, {
      grade: 7,
      subject: "Lenguaje",
      sourceDocument: "lenguaje-7",
      chunkSize: 320,
      chunkOverlap: 60,
    });

    expect(chunks.length).toBeGreaterThan(1);
    expect(chunks[0]).toMatchObject({
      grade: 7,
      subject: "lenguaje",
      unit: "U4",
      source_document: "lenguaje-7",
      source_page_start: 12,
      section_title: "Unidad 4",
      chunk_index: 0,
    });
    expect(chunks[0]?.objective_code).toMatch(/^L7\.4\.P12\.C1$/);
    expect(chunks[0]?.content_hash).toMatch(/^[a-f0-9]{64}$/);
    expect(chunks.every((chunk) => chunk.text.length <= 320)).toBe(true);
    expect(chunks.every((chunk) => chunk.source_page_start === chunk.source_page_end)).toBe(true);
  });

  it("honors a forced unit when ingesting a known page slice", async () => {
    const chunks = await buildCurriculumChunksFromPages(
      [{ pageNumber: 30, text: repeatedWords("sustantivo comun propio texto", 70) }],
      {
        grade: 7,
        subject: "lenguaje",
        sourceDocument: "lenguaje-7",
        forcedUnit: "Unidad 2",
      },
    );

    expect(chunks.length).toBeGreaterThan(0);
    expect(chunks.every((chunk) => chunk.unit === "U2")).toBe(true);
    expect(chunks[0]?.objective_code).toBe("L7.2.P30.C1");
  });

  it("drops empty pages and likely page-number noise", async () => {
    const chunks = await buildCurriculumChunksFromPages(
      [
        { pageNumber: 1, text: "12" },
        { pageNumber: 2, text: repeatedWords("cuento personajes narrador ambiente", 65) },
      ],
      {
        grade: 7,
        subject: "lenguaje",
        sourceDocument: "lenguaje-7",
        forcedUnit: "U1",
      },
    );

    expect(chunks.length).toBeGreaterThan(0);
    expect(chunks.every((chunk) => chunk.source_page_start === 2)).toBe(true);
  });

  it("uses recursive character chunks with overlap inside one page", async () => {
    const text = Array.from(
      { length: 360 },
      (_, index) => `palabra${index.toString().padStart(3, "0")}`,
    ).join(" ");

    const chunks = await buildCurriculumChunksFromPages(
      [{ pageNumber: 8, text }],
      {
        grade: 7,
        subject: "lenguaje",
        sourceDocument: "lenguaje-7",
        forcedUnit: "U3",
      },
    );

    expect(chunks.length).toBeGreaterThan(2);
    expect(chunks.every((chunk) => chunk.text.length <= 1_000)).toBe(true);
    expect(sharedBoundaryLength(chunks[0]!.text, chunks[1]!.text)).toBeGreaterThan(0);
    expect(sharedBoundaryLength(chunks[0]!.text, chunks[1]!.text)).toBeLessThanOrEqual(200);
  });

  it("never mixes pages or units in one chunk", async () => {
    const chunks = await buildCurriculumChunksFromPages(
      [
        {
          pageNumber: 20,
          text: [
            "Unidad 1",
            "",
            repeatedWords("contenido pagina uno", 80),
            "",
            "Unidad 2",
            "",
            repeatedWords("contenido pagina dos", 80),
          ].join("\n"),
        },
        { pageNumber: 21, text: repeatedWords("contenido pagina siguiente", 80) },
      ],
      {
        grade: 7,
        subject: "lenguaje",
        sourceDocument: "lenguaje-7",
        chunkSize: 300,
        chunkOverlap: 50,
      },
    );

    expect(chunks.some((chunk) => chunk.unit === "U1")).toBe(true);
    expect(chunks.some((chunk) => chunk.unit === "U2")).toBe(true);
    expect(chunks.every((chunk) => chunk.source_page_start === chunk.source_page_end)).toBe(true);
    expect(
      chunks.every(
        (chunk) => !(chunk.text.includes("pagina uno") && chunk.text.includes("pagina dos")),
      ),
    ).toBe(true);
  });

  it("builds deterministic chunk identities", async () => {
    const pages = [{ pageNumber: 4, text: repeatedWords("cuento narrador ambiente", 100) }];
    const options = {
      grade: 7,
      subject: "lenguaje",
      sourceDocument: "lenguaje-7",
      classId: "class-1",
      forcedUnit: "U1",
      chunkSize: 240,
      chunkOverlap: 40,
    };

    await expect(buildCurriculumChunksFromPages(pages, options)).resolves.toEqual(
      await buildCurriculumChunksFromPages(pages, options),
    );
  });

  it("rejects invalid overlap configuration", async () => {
    await expect(
      buildCurriculumChunksFromPages([{ pageNumber: 1, text: "contenido" }], {
        grade: 7,
        subject: "lenguaje",
        sourceDocument: "lenguaje-7",
        chunkSize: 200,
        chunkOverlap: 200,
      }),
    ).rejects.toThrow("chunkOverlap");
  });
});

function repeatedWords(words: string, repetitions: number): string {
  return Array.from({ length: repetitions }, () => words).join(" ");
}

function sharedBoundaryLength(left: string, right: string): number {
  const maximum = Math.min(200, left.length, right.length);
  for (let length = maximum; length > 0; length -= 1) {
    if (left.endsWith(right.slice(0, length))) return length;
  }
  return 0;
}
