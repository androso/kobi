import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import path from "node:path";
import type { SupabaseClient } from "@supabase/supabase-js";
import { embedText } from "./embedCurriculumChunk.js";
import type { CurriculumChunkInput } from "./types.js";

export interface DigestTextbookPdfInput {
  sourcePath: string;
  grade: number;
  subject: string;
  sourceDocument?: string;
  unit?: string;
  pageStart?: number;
  pageEnd?: number;
  replaceSource?: boolean;
  dryRun?: boolean;
  minTextPageCoverage?: number;
  embedConcurrency?: number;
  insertBatchSize?: number;
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
  forcedUnit?: string;
  targetWords?: number;
  maxWords?: number;
}

interface PdfTextExtractor {
  pageCount(sourcePath: string): Promise<number>;
  extractPage(sourcePath: string, pageNumber: number): Promise<string>;
  close?(): Promise<void>;
}

interface TextParagraph {
  text: string;
  pageNumber: number;
  unit: string;
  sectionTitle: string | null;
}

interface NormalizedDigestInput {
  sourcePath: string;
  grade: number;
  subject: string;
  sourceDocument: string;
  unit?: string;
  pageStart?: number;
  pageEnd?: number;
  replaceSource: boolean;
  dryRun: boolean;
  minTextPageCoverage: number;
  embedConcurrency: number;
  insertBatchSize: number;
}

const DEFAULT_TARGET_WORDS = 240;
const DEFAULT_MAX_WORDS = 320;
const DEFAULT_MIN_TEXT_PAGE_COVERAGE = 0.8;
const DEFAULT_EMBED_CONCURRENCY = 3;
const DEFAULT_INSERT_BATCH_SIZE = 50;

export async function digestTextbookPdf(
  supabase: SupabaseClient,
  input: DigestTextbookPdfInput,
): Promise<DigestTextbookPdfResult> {
  const normalized = normalizeDigestInput(input);
  const extractor = await createPdfJsTextExtractor();

  try {
    const pageCount = await extractor.pageCount(normalized.sourcePath);
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

    const pages: ExtractedPdfPage[] = [];
    let pagesWithText = 0;
    for (let pageNumber = pageStart; pageNumber <= pageEnd; pageNumber += 1) {
      const text = normalizePdfText(await extractor.extractPage(normalized.sourcePath, pageNumber));
      if (text) pagesWithText += 1;
      pages.push({ pageNumber, text });
    }

    const pagesRead = pages.length;
    const textCoverage = pagesRead === 0 ? 0 : pagesWithText / pagesRead;
    if (textCoverage < normalized.minTextPageCoverage) {
      throw new Error(
        `digestTextbookPdf: only ${Math.round(textCoverage * 100)}% of selected pages yielded text; ` +
          "this looks like a scanned PDF and needs OCR before ingestion.",
      );
    }

    const chunks = buildCurriculumChunksFromPages(pages, {
      grade: normalized.grade,
      subject: normalized.subject,
      sourceDocument: normalized.sourceDocument,
      forcedUnit: normalized.unit,
    });

    if (normalized.dryRun) {
      return buildResult(normalized.sourceDocument, pageCount, pagesRead, pagesWithText, chunks, 0, true);
    }

    if (normalized.replaceSource) {
      await deleteExistingSource(supabase, normalized.sourceDocument);
    }

    const inserted = await embedAndUpsertChunks(supabase, chunks, {
      embedConcurrency: normalized.embedConcurrency,
      insertBatchSize: normalized.insertBatchSize,
    });

    return buildResult(normalized.sourceDocument, pageCount, pagesRead, pagesWithText, chunks, inserted, false);
  } finally {
    await extractor.close?.();
  }
}

export function buildCurriculumChunksFromPages(
  pages: ExtractedPdfPage[],
  options: TextChunkBuildOptions,
): CurriculumChunkInput[] {
  const grade = options.grade;
  const subject = normalizeSubject(options.subject);
  const sourceDocument = options.sourceDocument.trim();
  const targetWords = options.targetWords ?? DEFAULT_TARGET_WORDS;
  const maxWords = options.maxWords ?? DEFAULT_MAX_WORDS;

  if (!Number.isInteger(grade) || grade <= 0) {
    throw new Error("buildCurriculumChunksFromPages: grade must be a positive integer");
  }
  if (!subject) {
    throw new Error("buildCurriculumChunksFromPages: subject is required");
  }
  if (!sourceDocument) {
    throw new Error("buildCurriculumChunksFromPages: sourceDocument is required");
  }

  const paragraphs = collectParagraphs(pages, options.forcedUnit);
  const chunks: CurriculumChunkInput[] = [];
  let chunkTexts: TextParagraph[] = [];
  let currentWordCount = 0;

  function flush() {
    if (chunkTexts.length === 0) return;
    const text = chunkTexts.map((paragraph) => paragraph.text).join("\n\n").trim();
    if (!text) {
      chunkTexts = [];
      currentWordCount = 0;
      return;
    }

    const first = chunkTexts[0]!;
    const last = chunkTexts.at(-1)!;
    const unit = first.unit;
    const chunkIndex = chunks.filter((chunk) => chunk.unit === unit).length;
    const sourcePageStart = first.pageNumber;
    const sourcePageEnd = last.pageNumber;
    const sectionTitle = first.sectionTitle ?? last.sectionTitle ?? null;

    chunks.push({
      grade,
      subject,
      unit,
      objective_code: buildObjectiveCode({ grade, subject, unit, sourcePageStart, chunkIndex }),
      text,
      source_document: sourceDocument,
      source_page_start: sourcePageStart,
      source_page_end: sourcePageEnd,
      section_title: sectionTitle,
      chunk_index: chunkIndex,
      content_hash: hashChunk({ sourceDocument, grade, subject, unit, sourcePageStart, chunkIndex, text }),
    });

    chunkTexts = [];
    currentWordCount = 0;
  }

  for (const paragraph of paragraphs.flatMap((paragraph) => splitLongParagraph(paragraph, maxWords))) {
    const words = countWords(paragraph.text);
    const nextUnit = chunkTexts[0]?.unit;
    const unitChanged = nextUnit !== undefined && nextUnit !== paragraph.unit;
    const wouldExceedMax = currentWordCount >= 40 && currentWordCount + words > maxWords;
    if (unitChanged || wouldExceedMax) {
      flush();
    }

    chunkTexts.push(paragraph);
    currentWordCount += words;

    if (currentWordCount >= targetWords) {
      flush();
    }
  }

  flush();
  return chunks;
}

function splitLongParagraph(paragraph: TextParagraph, maxWords: number): TextParagraph[] {
  const words = paragraph.text.split(/\s+/).filter(Boolean);
  if (words.length <= maxWords) return [paragraph];

  const parts: TextParagraph[] = [];
  for (let index = 0; index < words.length; index += maxWords) {
    parts.push({
      ...paragraph,
      text: words.slice(index, index + maxWords).join(" "),
    });
  }
  return parts;
}

export function normalizePdfText(text: string): string {
  return text
    .replace(/\r/g, "\n")
    .replace(/[ \t]+\n/g, "\n")
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
  grade: number;
  subject: string;
  unit: string;
  sourcePageStart: number;
  chunkIndex: number;
  text: string;
}): string {
  return createHash("sha256")
    .update(JSON.stringify(input))
    .digest("hex");
}

async function embedAndUpsertChunks(
  supabase: SupabaseClient,
  chunks: CurriculumChunkInput[],
  options: { embedConcurrency: number; insertBatchSize: number },
): Promise<number> {
  let inserted = 0;
  for (let index = 0; index < chunks.length; index += options.insertBatchSize) {
    const batch = chunks.slice(index, index + options.insertBatchSize);
    const rows = await mapWithConcurrency(batch, options.embedConcurrency, async (chunk) => ({
      ...chunk,
      embedding: await embedText(chunk.text, "RETRIEVAL_DOCUMENT"),
    }));

    const { error } = await supabase
      .from("curriculum_chunks")
      .upsert(rows, { onConflict: "content_hash" });
    if (error) {
      throw new Error(`digestTextbookPdf: failed to upsert curriculum_chunks: ${error.message}`);
    }

    inserted += rows.length;
  }

  return inserted;
}

async function deleteExistingSource(supabase: SupabaseClient, sourceDocument: string): Promise<void> {
  const { error } = await supabase
    .from("curriculum_chunks")
    .delete()
    .eq("source_document", sourceDocument);
  if (error) {
    throw new Error(`digestTextbookPdf: failed to delete existing source rows: ${error.message}`);
  }
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

function normalizeDigestInput(input: DigestTextbookPdfInput): NormalizedDigestInput {
  const sourcePath = path.resolve(input.sourcePath);
  const sourceDocument = (input.sourceDocument ?? path.basename(sourcePath, path.extname(sourcePath))).trim();
  const subject = normalizeSubject(input.subject);

  if (!sourcePath) {
    throw new Error("digestTextbookPdf: sourcePath is required");
  }
  if (!Number.isInteger(input.grade) || input.grade <= 0) {
    throw new Error("digestTextbookPdf: grade must be a positive integer");
  }
  if (!subject) {
    throw new Error("digestTextbookPdf: subject is required");
  }
  if (!sourceDocument) {
    throw new Error("digestTextbookPdf: sourceDocument is required");
  }

  return {
    sourcePath,
    grade: input.grade,
    subject,
    sourceDocument,
    unit: input.unit?.trim() || undefined,
    pageStart: input.pageStart ?? 1,
    pageEnd: input.pageEnd,
    replaceSource: input.replaceSource ?? false,
    dryRun: input.dryRun ?? false,
    minTextPageCoverage: input.minTextPageCoverage ?? DEFAULT_MIN_TEXT_PAGE_COVERAGE,
    embedConcurrency: input.embedConcurrency ?? DEFAULT_EMBED_CONCURRENCY,
    insertBatchSize: input.insertBatchSize ?? DEFAULT_INSERT_BATCH_SIZE,
  };
}

function normalizeSubject(subject: string): string {
  return subject.trim().toLocaleLowerCase("es-SV");
}

function countWords(text: string): number {
  return text.split(/\s+/).filter(Boolean).length;
}

function isLikelyPageNoise(text: string): boolean {
  if (/^\d+$/.test(text)) return true;
  if (/^ministerio de educaci[oó]n$/i.test(text)) return true;
  return false;
}

async function createPdfJsTextExtractor(): Promise<PdfTextExtractor> {
  const pdfjs = await importPdfJs();
  let loadingTask: { promise: Promise<PdfDocument>; destroy?: () => Promise<void> } | null = null;
  let document: PdfDocument | null = null;
  let loadedPath: string | null = null;

  async function load(sourcePath: string): Promise<PdfDocument> {
    if (document && loadedPath === sourcePath) return document;
    if (loadingTask) await loadingTask.destroy?.();

    const data = new Uint8Array(await readFile(sourcePath));
    loadingTask = pdfjs.getDocument({ data, disableWorker: true });
    document = await loadingTask.promise;
    loadedPath = sourcePath;
    return document;
  }

  return {
    async pageCount(sourcePath: string) {
      const pdf = await load(sourcePath);
      return pdf.numPages;
    },
    async extractPage(sourcePath: string, pageNumber: number) {
      const pdf = await load(sourcePath);
      const page = await pdf.getPage(pageNumber);
      const content = await page.getTextContent();
      return content.items
        .map((item) => ("str" in item && typeof item.str === "string" ? item.str : ""))
        .join("\n");
    },
    async close() {
      await loadingTask?.destroy?.();
      document = null;
      loadingTask = null;
      loadedPath = null;
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
