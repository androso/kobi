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
  it("detects units, sections, page ranges, and stable source metadata", () => {
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

    const chunks = buildCurriculumChunksFromPages(pages, {
      grade: 7,
      subject: "Lenguaje",
      sourceDocument: "lenguaje-7",
      targetWords: 80,
      maxWords: 120,
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
  });

  it("honors a forced unit when ingesting a known page slice", () => {
    const chunks = buildCurriculumChunksFromPages(
      [{ pageNumber: 30, text: repeatedWords("sustantivo comun propio texto", 70) }],
      {
        grade: 7,
        subject: "lenguaje",
        sourceDocument: "lenguaje-7",
        forcedUnit: "Unidad 2",
      },
    );

    expect(chunks).toHaveLength(1);
    expect(chunks[0]?.unit).toBe("U2");
    expect(chunks[0]?.objective_code).toBe("L7.2.P30.C1");
  });

  it("drops empty pages and likely page-number noise", () => {
    const chunks = buildCurriculumChunksFromPages(
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

    expect(chunks).toHaveLength(1);
    expect(chunks[0]?.source_page_start).toBe(2);
  });
});

function repeatedWords(words: string, repetitions: number): string {
  return Array.from({ length: repetitions }, () => words).join(" ");
}
