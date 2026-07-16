import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { RecursiveCharacterTextSplitter } from "@langchain/textsplitters";
import type { SupabaseClient } from "@supabase/supabase-js";
import { embedText } from "./embedCurriculumChunk.js";
import { replaceCurriculumSource } from "./replaceCurriculumSource.js";
import type { CurriculumChunkInput, CurriculumChunkRow } from "./types.js";

export interface DigestTextbookPdfInput {
  /** Local path for CLI/dev only. Prefer `pdfBytes` for the product path. */
  sourcePath?: string;
  /** Product path: PDF bytes already loaded from storage. */
  pdfBytes?: Uint8Array;
  grade: number;
  subject: string;
  sourceDocument?: string;
  classId?: string;
  unit?: string;
  pageStart?: number;
  pageEnd?: number;
  /** Always true for product ingest; kept for CLI dry-run compatibility. */
  replaceSource?: boolean;
  dryRun?: boolean;
  minTextPageCoverage?: number;
  embedConcurrency?: number;
  insertBatchSize?: number;
  maxPages?: number;
  maxBytes?: number;
  maxChunks?: number;
}

export interface DigestTextbookPdfResult {
  sourceDocument: string;
  pageCount: number;
  pagesRead: number;
  pagesWithText: number;
  textCoverage: number;
  chunksBuilt: number;
  inserted: number;
  dryRun: boolean;
  units: string[];
}

export interface ExtractedPdfPage {
  pageNumber: number;
  text: string;
}

export interface TextChunkBuildOptions {
  grade: number;
  subject: string;
  sourceDocument: string;
  classId?: string;
  forcedUnit?: string;
  chunkSize?: number;
  chunkOverlap?: number;
}

interface PdfTextExtractor {
  pageCount(): Promise<number>;
  extractPage(pageNumber: number): Promise<string>;
  close?(): Promise<void>;
}

interface TextParagraph {
  text: string;
  pageNumber: number;
  unit: string;
  sectionTitle: string | null;
}

interface NormalizedDigestInput {
  pdfBytes: Uint8Array;
  grade: number;
  subject: string;
  sourceDocument: string;
  classId?: string;
  unit?: string;
  pageStart?: number;
  pageEnd?: number;
  replaceSource: boolean;
  dryRun: boolean;
  minTextPageCoverage: number;
  embedConcurrency: number;
  insertBatchSize: number;
  maxPages: number;
  maxBytes: number;
  maxChunks: number;
}

const DEFAULT_CHUNK_SIZE = 1_000;
const DEFAULT_CHUNK_OVERLAP = 200;
const TEXT_SPLIT_SEPARATORS = ["\n\n", "\n", " ", ""];
const DEFAULT_MIN_TEXT_PAGE_COVERAGE = 0.8;
const DEFAULT_EMBED_CONCURRENCY = 2;
const DEFAULT_INSERT_BATCH_SIZE = 50;
const DEFAULT_MAX_PAGES = 400;
const DEFAULT_MAX_BYTES = 100 * 1024 * 1024;
const DEFAULT_MAX_CHUNKS = 1_000;
const EMBEDDING_DIMENSIONS = 768;

export async function digestTextbookPdf(
  supabase: SupabaseClient,
  input: DigestTextbookPdfInput,
): Promise<DigestTextbookPdfResult> {
  const normalized = await normalizeDigestInput(input);
  if (normalized.pdfBytes.byteLength > normalized.maxBytes) {
    throw new Error(
      `digestTextbookPdf: PDF exceeds maxBytes ${normalized.maxBytes} (${normalized.pdfBytes.byteLength} bytes)`,
    );
  }

  const extractor = await createPdfJsTextExtractor(normalized.pdfBytes);

  try {
    const pageCount = await extractor.pageCount();
    const pageStart = normalized.pageStart ?? 1;
    const pageEnd = normalized.pageEnd ?? pageCount;

    if (pageStart > pageCount) {
      throw new Error(`digestTextbookPdf: pageStart ${pageStart} exceeds PDF page count ${pageCount}`);
    }
    if (pageEnd > pageCount) {
      throw new Error(`digestTextbookPdf: pageEnd ${pageEnd} exceeds PDF page count ${pageCount}`);
    }
    if (pageStart > pageEnd) {
      throw new Error("digestTextbookPdf: pageStart must be less than or equal to pageEnd");
    }
    if (pageEnd - pageStart + 1 > normalized.maxPages) {
      throw new Error(
        `digestTextbookPdf: selected page span exceeds maxPages ${normalized.maxPages}`,
      );
    }

    const pages: ExtractedPdfPage[] = [];
    let pagesWithText = 0;
    for (let pageNumber = pageStart; pageNumber <= pageEnd; pageNumber += 1) {
      const text = normalizePdfText(await extractor.extractPage(pageNumber));
      if (text) pagesWithText += 1;
      pages.push({ pageNumber, text });
    }

    const pagesRead = pages.length;
    const textCoverage = pagesRead === 0 ? 0 : pagesWithText / pagesRead;
    if (textCoverage < normalized.minTextPageCoverage) {
      throw new Error(
        `digestTextbookPdf: only ${Math.round(textCoverage * 100)}% of selected pages yielded text; ` +
          "this looks like a scanned PDF and needs OCR before ingestion (OCR_REQUIRED).",
      );
    }

    const chunks = await buildCurriculumChunksFromPages(pages, {
      grade: normalized.grade,
      subject: normalized.subject,
      sourceDocument: normalized.sourceDocument,
      classId: normalized.classId,
      forcedUnit: normalized.unit,
    });

    if (chunks.length > normalized.maxChunks) {
      throw new Error(
        `digestTextbookPdf: built ${chunks.length} chunks which exceeds maxChunks ${normalized.maxChunks}`,
      );
    }

    if (normalized.dryRun) {
      return buildResult(normalized.sourceDocument, pageCount, pagesRead, pagesWithText, chunks, 0, true);
    }

    const rows = await embedChunks(chunks, {
      embedConcurrency: normalized.embedConcurrency,
      insertBatchSize: normalized.insertBatchSize,
    });

    const inserted = await replaceCurriculumSource(supabase, {
      sourceDocument: normalized.sourceDocument,
      classId: normalized.classId,
      rows,
    });

    return buildResult(normalized.sourceDocument, pageCount, pagesRead, pagesWithText, chunks, inserted, false);
  } finally {
    await extractor.close?.();
  }
}

export async function buildCurriculumChunksFromPages(
  pages: ExtractedPdfPage[],
  options: TextChunkBuildOptions,
): Promise<CurriculumChunkInput[]> {
  const grade = options.grade;
  const subject = normalizeSubject(options.subject);
  const sourceDocument = options.sourceDocument.trim();
  const classId = options.classId?.trim() || null;
  const chunkSize = options.chunkSize ?? DEFAULT_CHUNK_SIZE;
  const chunkOverlap = options.chunkOverlap ?? DEFAULT_CHUNK_OVERLAP;

  if (!Number.isInteger(grade) || grade <= 0) {
    throw new Error("buildCurriculumChunksFromPages: grade must be a positive integer");
  }
  if (!subject) {
    throw new Error("buildCurriculumChunksFromPages: subject is required");
  }
  if (!sourceDocument) {
    throw new Error("buildCurriculumChunksFromPages: sourceDocument is required");
  }
  if (!Number.isInteger(chunkSize) || chunkSize <= 0) {
    throw new Error("buildCurriculumChunksFromPages: chunkSize must be a positive integer");
  }
  if (!Number.isInteger(chunkOverlap) || chunkOverlap < 0 || chunkOverlap >= chunkSize) {
    throw new Error(
      "buildCurriculumChunksFromPages: chunkOverlap must be a non-negative integer smaller than chunkSize",
    );
  }

  const paragraphs = collectParagraphs(pages, options.forcedUnit);
  const chunks: CurriculumChunkInput[] = [];
  const chunkIndexesByUnit = new Map<string, number>();
  const textSplitter = new RecursiveCharacterTextSplitter({
    chunkSize,
    chunkOverlap,
    separators: TEXT_SPLIT_SEPARATORS,
    keepSeparator: true,
  });

  for (const group of groupParagraphsByPageAndUnit(paragraphs)) {
    const first = group[0]!;
    const last = group.at(-1)!;
    const unit = first.unit;
    const sourcePage = first.pageNumber;
    const sectionTitle = first.sectionTitle ?? last.sectionTitle ?? null;
    const pageText = group.map((paragraph) => paragraph.text).join("\n\n").trim();
    const splitTexts = await textSplitter.splitText(pageText);

    for (const splitText of splitTexts) {
      const text = splitText.trim();
      if (!text) continue;

      const chunkIndex = chunkIndexesByUnit.get(unit) ?? 0;
      chunks.push({
        grade,
        subject,
        unit,
        objective_code: buildObjectiveCode({ grade, subject, unit, sourcePageStart: sourcePage, chunkIndex }),
        text,
        class_id: classId,
        source_document: sourceDocument,
        source_page_start: sourcePage,
        source_page_end: sourcePage,
        section_title: sectionTitle,
        chunk_index: chunkIndex,
        content_hash: hashChunk({
          sourceDocument,
          classId,
          grade,
          subject,
          unit,
          sourcePageStart: sourcePage,
          chunkIndex,
          text,
        }),
      });
      chunkIndexesByUnit.set(unit, chunkIndex + 1);
    }
  }

  return chunks;
}

function groupParagraphsByPageAndUnit(paragraphs: TextParagraph[]): TextParagraph[][] {
  const groups: TextParagraph[][] = [];

  for (const paragraph of paragraphs) {
    const current = groups.at(-1);
    const first = current?.[0];
    if (!current || first?.pageNumber !== paragraph.pageNumber || first.unit !== paragraph.unit) {
      groups.push([paragraph]);
    } else {
      current.push(paragraph);
    }
  }

  return groups;
}

export function normalizePdfText(text: string): string {
  return text
    .replace(/\r/g, "\n")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n[ \t]+/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .replace(/[ \t]{2,}/g, " ")
    .trim();
}

function collectParagraphs(pages: ExtractedPdfPage[], forcedUnit?: string): TextParagraph[] {
  const paragraphs: TextParagraph[] = [];
  let currentUnit = normalizeUnit(forcedUnit) ?? "U0";
  let currentSectionTitle: string | null = null;

  for (const page of pages) {
    const pageText = normalizePdfText(page.text);
    if (!pageText) continue;

    for (const rawParagraph of pageText.split(/\n\s*\n/)) {
      const paragraph = rawParagraph.replace(/\s+/g, " ").trim();
      if (!paragraph || isLikelyPageNoise(paragraph)) continue;

      const detectedUnit = forcedUnit ? null : detectUnit(paragraph);
      if (detectedUnit) {
        currentUnit = detectedUnit;
      }

      const detectedSection = detectSectionTitle(paragraph);
      if (detectedSection) {
        currentSectionTitle = detectedSection;
      }

      paragraphs.push({
        text: paragraph,
        pageNumber: page.pageNumber,
        unit: normalizeUnit(forcedUnit) ?? currentUnit,
        sectionTitle: currentSectionTitle,
      });
    }
  }

  return paragraphs;
}

function detectUnit(text: string): string | null {
  const match = text.match(/\bunidad\s+(\d{1,2})\b/i);
  return match ? `U${Number(match[1])}` : null;
}

function detectSectionTitle(text: string): string | null {
  if (text.length > 140) return null;
  if (/\b(unidad|lecci[oó]n|lectura|tema|indicador(?:es)? de logro|contenido)\b/i.test(text)) {
    return text;
  }
  return null;
}

function normalizeUnit(unit: string | undefined): string | null {
  const trimmed = unit?.trim();
  if (!trimmed) return null;
  const unitNumber = trimmed.match(/^u(?:nidad)?\s*(\d{1,2})$/i);
  return unitNumber ? `U${Number(unitNumber[1])}` : trimmed;
}

function buildObjectiveCode(input: {
  grade: number;
  subject: string;
  unit: string;
  sourcePageStart: number;
  chunkIndex: number;
}): string {
  const subjectPrefix = input.subject.toLocaleLowerCase("es-SV").startsWith("lenguaje") ? "L" : "CUR";
  const unitNumber = input.unit.match(/\d+/)?.[0] ?? "0";
  return `${subjectPrefix}${input.grade}.${unitNumber}.P${input.sourcePageStart}.C${input.chunkIndex + 1}`;
}

function hashChunk(input: {
  sourceDocument: string;
  classId: string | null;
  grade: number;
  subject: string;
  unit: string;
  sourcePageStart: number;
  chunkIndex: number;
  text: string;
}): string {
  return createHash("sha256").update(JSON.stringify(input)).digest("hex");
}

async function embedChunks(
  chunks: CurriculumChunkInput[],
  options: { embedConcurrency: number; insertBatchSize: number },
): Promise<CurriculumChunkRow[]> {
  const rows: CurriculumChunkRow[] = [];
  for (let index = 0; index < chunks.length; index += options.insertBatchSize) {
    const batch = chunks.slice(index, index + options.insertBatchSize);
    const embedded = await mapWithConcurrency(batch, options.embedConcurrency, async (chunk) => {
      const embedding = await embedText(chunk.text, "RETRIEVAL_DOCUMENT");
      if (embedding.length !== EMBEDDING_DIMENSIONS) {
        throw new Error(
          `digestTextbookPdf: embedding length ${embedding.length} != ${EMBEDDING_DIMENSIONS}`,
        );
      }
      return { ...chunk, embedding };
    });
    rows.push(...embedded);
  }
  return rows;
}

async function mapWithConcurrency<T, R>(
  values: T[],
  concurrency: number,
  mapper: (value: T, index: number) => Promise<R>,
): Promise<R[]> {
  const results = new Array<R>(values.length);
  let nextIndex = 0;
  const workerCount = Math.min(Math.max(1, concurrency), values.length);

  await Promise.all(
    Array.from({ length: workerCount }, async () => {
      while (nextIndex < values.length) {
        const currentIndex = nextIndex;
        nextIndex += 1;
        results[currentIndex] = await mapper(values[currentIndex]!, currentIndex);
      }
    }),
  );

  return results;
}

function buildResult(
  sourceDocument: string,
  pageCount: number,
  pagesRead: number,
  pagesWithText: number,
  chunks: CurriculumChunkInput[],
  inserted: number,
  dryRun: boolean,
): DigestTextbookPdfResult {
  return {
    sourceDocument,
    pageCount,
    pagesRead,
    pagesWithText,
    textCoverage: pagesRead === 0 ? 0 : pagesWithText / pagesRead,
    chunksBuilt: chunks.length,
    inserted,
    dryRun,
    units: [...new Set(chunks.map((chunk) => chunk.unit))],
  };
}

async function normalizeDigestInput(input: DigestTextbookPdfInput): Promise<NormalizedDigestInput> {
  const subject = normalizeSubject(input.subject);
  const sourceDocument = (
    input.sourceDocument ??
    (input.sourcePath ? path.basename(input.sourcePath, path.extname(input.sourcePath)) : "")
  ).trim();

  if (!Number.isInteger(input.grade) || input.grade <= 0) {
    throw new Error("digestTextbookPdf: grade must be a positive integer");
  }
  if (!subject) {
    throw new Error("digestTextbookPdf: subject is required");
  }
  if (!sourceDocument) {
    throw new Error("digestTextbookPdf: sourceDocument is required");
  }

  let pdfBytes = input.pdfBytes;
  if (!pdfBytes) {
    if (!input.sourcePath?.trim()) {
      throw new Error("digestTextbookPdf: pdfBytes or sourcePath is required");
    }
    pdfBytes = new Uint8Array(await readFile(path.resolve(input.sourcePath)));
  }

  return {
    pdfBytes,
    grade: input.grade,
    subject,
    sourceDocument,
    classId: input.classId?.trim() || undefined,
    unit: input.unit?.trim() || undefined,
    pageStart: input.pageStart ?? 1,
    pageEnd: input.pageEnd,
    replaceSource: input.replaceSource ?? true,
    dryRun: input.dryRun ?? false,
    minTextPageCoverage: input.minTextPageCoverage ?? DEFAULT_MIN_TEXT_PAGE_COVERAGE,
    embedConcurrency: input.embedConcurrency ?? DEFAULT_EMBED_CONCURRENCY,
    insertBatchSize: input.insertBatchSize ?? DEFAULT_INSERT_BATCH_SIZE,
    maxPages: input.maxPages ?? DEFAULT_MAX_PAGES,
    maxBytes: input.maxBytes ?? DEFAULT_MAX_BYTES,
    maxChunks: input.maxChunks ?? DEFAULT_MAX_CHUNKS,
  };
}

function normalizeSubject(subject: string): string {
  return subject.trim().toLocaleLowerCase("es-SV");
}

function isLikelyPageNoise(text: string): boolean {
  if (/^\d+$/.test(text)) return true;
  if (/^ministerio de educaci[oó]n$/i.test(text)) return true;
  return false;
}

async function createPdfJsTextExtractor(pdfBytes: Uint8Array): Promise<PdfTextExtractor> {
  const pdfjs = await importPdfJs();
  const loadingTask = pdfjs.getDocument({ data: pdfBytes, disableWorker: true });
  const document = await loadingTask.promise;

  return {
    async pageCount() {
      return document.numPages;
    },
    async extractPage(pageNumber: number) {
      const page = await document.getPage(pageNumber);
      const content = await page.getTextContent();
      return content.items
        .map((item) => ("str" in item && typeof item.str === "string" ? item.str : ""))
        .join("\n");
    },
    async close() {
      await loadingTask.destroy?.();
    },
  };
}

interface PdfDocument {
  numPages: number;
  getPage(pageNumber: number): Promise<{
    getTextContent(): Promise<{ items: Array<{ str?: string }> }>;
  }>;
}

interface PdfJsModule {
  getDocument(input: {
    data: Uint8Array;
    disableWorker: boolean;
  }): { promise: Promise<PdfDocument>; destroy?: () => Promise<void> };
}

async function importPdfJs(): Promise<PdfJsModule> {
  try {
    const dynamicImport = new Function("specifier", "return import(specifier)") as (
      specifier: string,
    ) => Promise<PdfJsModule>;
    return await dynamicImport("pdfjs-dist/legacy/build/pdf.mjs");
  } catch (error) {
    throw new Error(
      "digestTextbookPdf: pdfjs-dist is required for PDF ingestion. Run pnpm install before using this script.",
      { cause: error },
    );
  }
}
