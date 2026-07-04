/**
 * The Area B -> Area C contract. This is what retrieveCurriculumMatches()
 * returns and what Androso's activity planner (packages/activities) consumes
 * alongside lesson_state and the activity repository. See
 * docs/area-bc-contract.md for the full write-up shared with Androso.
 */
export interface CurriculumMatch {
  objective_code: string;
  unit: string;
  grade: number;
  subject: string;
  text: string;
  /** Cosine similarity, 0-1, higher is better. */
  similarity: number;
}

export interface CurriculumChunkInput {
  grade: number;
  subject: string;
  unit: string;
  objective_code: string;
  text: string;
}

export interface RetrieveCurriculumMatchesInput {
  /** Free-text query, typically lesson_state.topic + objective_guess + key_terms joined. */
  queryText: string;
  grade: number;
  subject: string;
  /** Optional — narrows to one unit when known (e.g. the class's selected unit). */
  unit?: string;
  /** Defaults to 3, matching the spec's "pgvector top-3" retrieval mode. */
  matchCount?: number;
}
