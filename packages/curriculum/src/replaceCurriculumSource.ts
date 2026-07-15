import type { SupabaseClient } from "@supabase/supabase-js";
import type { CurriculumChunkRow } from "./types.js";

const EMBEDDING_DIMENSIONS = 768;
const MAX_REPLACE_ROWS = 1_000;

export interface ReplaceCurriculumSourceInput {
  sourceDocument: string;
  classId?: string | null;
  rows: CurriculumChunkRow[];
}

/**
 * Atomically replaces one teacher-fed curriculum corpus through the database RPC.
 * The database validates the full batch, deletes the previous class/source rows,
 * inserts the replacement rows, and rolls the delete back if insertion fails.
 */
export async function replaceCurriculumSource(
  supabase: SupabaseClient,
  input: ReplaceCurriculumSourceInput,
): Promise<number> {
  const sourceDocument = input.sourceDocument.trim();
  if (!sourceDocument) {
    throw new Error("replaceCurriculumSource: sourceDocument is required");
  }
  if (input.rows.length === 0) {
    throw new Error("replaceCurriculumSource: rows must not be empty");
  }
  if (input.rows.length > MAX_REPLACE_ROWS) {
    throw new Error(
      `replaceCurriculumSource: at most ${MAX_REPLACE_ROWS} rows allowed, got ${input.rows.length}`,
    );
  }

  const classId = input.classId?.trim() || null;
  const payload = input.rows.map((row, index) => {
    if (row.source_document !== sourceDocument) {
      throw new Error(
        `replaceCurriculumSource: row ${index} source_document must match ${sourceDocument}`,
      );
    }
    if (classId && row.class_id && row.class_id !== classId) {
      throw new Error(`replaceCurriculumSource: row ${index} class_id must match ${classId}`);
    }
    if (!Array.isArray(row.embedding) || row.embedding.length !== EMBEDDING_DIMENSIONS) {
      throw new Error(
        `replaceCurriculumSource: row ${index} embedding must have ${EMBEDDING_DIMENSIONS} dimensions`,
      );
    }
    if (row.embedding.some((value) => typeof value !== "number" || !Number.isFinite(value))) {
      throw new Error(`replaceCurriculumSource: row ${index} embedding must be finite numbers`);
    }
    if (!row.content_hash) {
      throw new Error(`replaceCurriculumSource: row ${index} content_hash is required`);
    }
    return {
      ...row,
      class_id: classId ?? row.class_id ?? null,
      source_document: sourceDocument,
    };
  });

  const hashes = new Set(payload.map((row) => row.content_hash));
  if (hashes.size !== payload.length) {
    throw new Error("replaceCurriculumSource: duplicate content_hash values in batch");
  }

  const { data, error } = await supabase.rpc("replace_curriculum_source", {
    p_class_id: classId,
    p_source_document: sourceDocument,
    p_rows: payload,
  });
  if (error) {
    throw new Error(`replaceCurriculumSource: failed to replace source: ${error.message}`);
  }

  return typeof data === "number" ? data : payload.length;
}
