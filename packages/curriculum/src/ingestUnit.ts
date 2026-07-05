import type { SupabaseClient } from "@supabase/supabase-js";
import { chunkTextbookUnit, type TextbookUnitSource } from "./chunkTextbookUnit.js";
import { embedText } from "./embedCurriculumChunk.js";

/**
 * Area B, stage 2: chunk -> embed -> insert. Run once per textbook unit
 * (pre-event, per the build plan's "ingest one Lenguaje unit" milestone).
 */
export async function ingestUnit(
  supabase: SupabaseClient,
  source: TextbookUnitSource,
): Promise<{ inserted: number }> {
  const chunks = chunkTextbookUnit(source);
  assertUniqueObjectiveCodes(chunks.map((chunk) => chunk.objective_code));

  const rows = await Promise.all(
    chunks.map(async (chunk) => ({
      ...chunk,
      embedding: await embedText(chunk.text, "RETRIEVAL_DOCUMENT"),
    })),
  );

  const { error } = await supabase.from("curriculum_chunks").insert(rows);
  if (error) {
    throw new Error(`ingestUnit: failed to insert curriculum_chunks: ${error.message}`);
  }

  return { inserted: rows.length };
}

function assertUniqueObjectiveCodes(objectiveCodes: string[]): void {
  const seen = new Set<string>();

  for (const objectiveCode of objectiveCodes) {
    if (seen.has(objectiveCode)) {
      throw new Error(`ingestUnit: duplicate objective_code ${objectiveCode}`);
    }

    seen.add(objectiveCode);
  }
}
