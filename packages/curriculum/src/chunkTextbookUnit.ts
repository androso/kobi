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
  const grade = source.grade;
  const subject = source.subject.trim().toLocaleLowerCase("es-SV");
  const unit = source.unit.trim();

  if (!Number.isInteger(grade) || grade <= 0) {
    throw new Error("chunkTextbookUnit: grade must be a positive integer");
  }

  if (!subject) {
    throw new Error("chunkTextbookUnit: subject is required");
  }

  if (!unit) {
    throw new Error("chunkTextbookUnit: unit is required");
  }

  const chunks = source.objectives.map((objective, index) => {
    const objectiveCode = objective.objective_code.trim();
    const text = objective.text.trim();

    if (!objectiveCode) {
      throw new Error(`chunkTextbookUnit: objectives[${index}].objective_code is required`);
    }

    if (!text) {
      throw new Error(`chunkTextbookUnit: objectives[${index}].text is required`);
    }

    return {
      grade,
      subject,
      unit,
      objective_code: objectiveCode,
      text,
    };
  });

  if (chunks.length === 0) {
    throw new Error("chunkTextbookUnit: at least one objective is required");
  }

  return chunks;
}
