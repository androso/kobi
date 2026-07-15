import type { SupabaseClient } from "@supabase/supabase-js";
import { embedText } from "./embedCurriculumChunk.js";
import type { CurriculumMatch, RetrieveCurriculumMatchesInput } from "./types.js";

const DEFAULT_MATCH_COUNT = 3;
const MAX_MATCH_COUNT = 8;

interface NormalizedRetrieveInput {
  queryText: string;
  grade: number;
  subject: string;
  unit: string | null;
  matchCount: number;
}

/**
 * Area B, stage 3: the function whose output is the B->C contract
 * (see docs/area-bc-contract.md). Triggered by Area A's rolling lesson_state
 * (every ~2 min) — callers should skip invoking this when lesson_state
 * confidence is too low rather than filtering after the fact.
 */
export async function retrieveCurriculumMatches(
  supabase: SupabaseClient,
  input: RetrieveCurriculumMatchesInput,
): Promise<CurriculumMatch[]> {
  const normalizedInput = normalizeRetrieveInput(input);
  const queryEmbedding = await embedText(normalizedInput.queryText, "RETRIEVAL_QUERY");

  const { data, error } = await supabase.rpc("match_curriculum_chunks", {
    query_embedding: queryEmbedding,
    match_grade: normalizedInput.grade,
    match_subject: normalizedInput.subject,
    match_unit: normalizedInput.unit,
    match_count: normalizedInput.matchCount,
  });

  if (error) {
    throw new Error(`retrieveCurriculumMatches: RPC failed: ${error.message}`);
  }

  return validateMatches(data ?? []);
}

function normalizeRetrieveInput(input: RetrieveCurriculumMatchesInput): NormalizedRetrieveInput {
  const queryText = input.queryText.trim();
  const subject = input.subject.trim().toLocaleLowerCase("es-SV");
  const unit = input.unit?.trim() || null;
  const matchCount = input.matchCount ?? DEFAULT_MATCH_COUNT;

  if (!queryText) {
    throw new Error("retrieveCurriculumMatches: queryText is required");
  }

  if (!Number.isInteger(input.grade) || input.grade <= 0) {
    throw new Error("retrieveCurriculumMatches: grade must be a positive integer");
  }

  if (!subject) {
    throw new Error("retrieveCurriculumMatches: subject is required");
  }

  if (!Number.isInteger(matchCount) || matchCount < 1 || matchCount > MAX_MATCH_COUNT) {
    throw new Error(`retrieveCurriculumMatches: matchCount must be between 1 and ${MAX_MATCH_COUNT}`);
  }

  return {
    queryText,
    grade: input.grade,
    subject,
    unit,
    matchCount,
  };
}

function validateMatches(rows: unknown[]): CurriculumMatch[] {
  return rows.map((row, index) => {
    if (!isRecord(row)) {
      throw new Error(`retrieveCurriculumMatches: RPC row ${index} was not an object`);
    }

    const match: CurriculumMatch = {
      objective_code: readString(row, "objective_code", index),
      unit: readString(row, "unit", index),
      grade: readNumber(row, "grade", index),
      subject: readString(row, "subject", index),
      text: readString(row, "text", index),
      source_document: readOptionalString(row, "source_document", index),
      source_page_start: readOptionalNumber(row, "source_page_start", index),
      source_page_end: readOptionalNumber(row, "source_page_end", index),
      section_title: readOptionalString(row, "section_title", index),
      chunk_index: readOptionalNumber(row, "chunk_index", index),
      similarity: readNumber(row, "similarity", index),
    };

    if (match.similarity < 0 || match.similarity > 1) {
      throw new Error(`retrieveCurriculumMatches: RPC row ${index} similarity must be between 0 and 1`);
    }

    return match;
  });
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function readString(row: Record<string, unknown>, key: keyof CurriculumMatch, index: number): string {
  const value = row[key];
  if (typeof value !== "string" || !value.trim()) {
    throw new Error(`retrieveCurriculumMatches: RPC row ${index} missing ${key}`);
  }

  return value.trim();
}

function readNumber(row: Record<string, unknown>, key: keyof CurriculumMatch, index: number): number {
  const value = row[key];
  if (typeof value !== "number" || !Number.isFinite(value)) {
    throw new Error(`retrieveCurriculumMatches: RPC row ${index} missing ${key}`);
  }

  return value;
}

function readOptionalString(row: Record<string, unknown>, key: keyof CurriculumMatch, index: number): string | null {
  const value = row[key];
  if (value === null || value === undefined) return null;
  if (typeof value !== "string") {
    throw new Error(`retrieveCurriculumMatches: RPC row ${index} invalid ${key}`);
  }

  const trimmed = value.trim();
  return trimmed || null;
}

function readOptionalNumber(row: Record<string, unknown>, key: keyof CurriculumMatch, index: number): number | null {
  const value = row[key];
  if (value === null || value === undefined) return null;
  if (typeof value !== "number" || !Number.isFinite(value)) {
    throw new Error(`retrieveCurriculumMatches: RPC row ${index} invalid ${key}`);
  }

  return value;
}
