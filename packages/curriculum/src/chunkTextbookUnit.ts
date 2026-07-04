import type { CurriculumChunkInput } from "./types.js";

export interface TextbookUnitSource {
  grade: number;
  subject: string;
  unit: string;
  /** One entry per curriculum objective, hand-authored (see content/curriculum/). */
  objectives: Array<{ objective_code: string; text: string }>;
}

/**
 * Area B, stage 1: chunking is hand-authored and objective-level for v0
 * (D-note in docs/area-bc-contract.md) — no PDF-parsing pipeline. This just
 * validates/shapes already-structured content into CurriculumChunkInput rows,
 * one chunk per objective (~150-300 tokens each, per the product spec).
 */
export function chunkTextbookUnit(source: TextbookUnitSource): CurriculumChunkInput[] {
  return source.objectives.map((objective) => ({
    grade: source.grade,
    subject: source.subject,
    unit: source.unit,
    objective_code: objective.objective_code,
    text: objective.text,
  }));
}
