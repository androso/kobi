import type { SupabaseClient } from "@supabase/supabase-js";
import { embedText } from "./embedCurriculumChunk.js";
import type { CurriculumMatch, RetrieveCurriculumMatchesInput } from "./types.js";

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
  const queryEmbedding = await embedText(input.queryText, "RETRIEVAL_QUERY");

  const { data, error } = await supabase.rpc("match_curriculum_chunks", {
    query_embedding: queryEmbedding,
    match_grade: input.grade,
    match_subject: input.subject,
    match_unit: input.unit ?? null,
    match_count: input.matchCount ?? 3,
  });

  if (error) {
    throw new Error(`retrieveCurriculumMatches: RPC failed: ${error.message}`);
  }

  return (data ?? []) as CurriculumMatch[];
}
