import type { LessonState } from "@kobi/ai-core";
import type { CurriculumMatch } from "@kobi/curriculum";
import type { ActivityEvidence, SessionContext } from "./types.js";

export interface BuildSessionContextOptions {
  maxVocabularyTerms?: number;
  maxExamples?: number;
  timeRemainingMinutes?: number | null;
}

/**
 * Builds Area C prompt context from structured lesson_state rows only.
 * Raw transcript text is intentionally not accepted by this function.
 */
export function buildActivitySessionContext(
  lessonStates: LessonState[],
  options: BuildSessionContextOptions = {},
): SessionContext {
  const maxVocabularyTerms = options.maxVocabularyTerms ?? 12;
  const maxExamples = options.maxExamples ?? 8;
  const latest = lessonStates.at(-1);

  const vocabulary = uniqueBounded(
    lessonStates.flatMap((state) => state.key_terms).filter(Boolean),
    maxVocabularyTerms,
  );

  const examples = uniqueBounded(
    lessonStates
      .flatMap((state) => state.evidence.quoted_phrases)
      .map((phrase) => phrase.trim())
      .filter(Boolean),
    maxExamples,
  );

  return {
    latest_topic: latest?.topic ?? "Tema de clase",
    latest_objective: latest?.objective_guess ?? null,
    vocabulary,
    examples_used: examples,
    misconceptions: [],
    time_remaining_minutes: options.timeRemainingMinutes ?? null,
    confidence: latest?.confidence ?? 0,
    segment_count: lessonStates.length,
  };
}

export function evidenceFromCurriculumMatches(matches: CurriculumMatch[]): ActivityEvidence[] {
  return matches.map((match) => ({
    objective_code: match.objective_code,
    section: `${match.unit} / ${match.objective_code}`,
    text: match.text,
    similarity: match.similarity,
  }));
}

export function hasMaterialContextChange(previous: SessionContext, next: SessionContext): boolean {
  if (previous.latest_topic !== next.latest_topic) return true;
  if (previous.latest_objective !== next.latest_objective) return true;

  const previousTerms = new Set(previous.vocabulary.map(normalize));
  return next.vocabulary.some((term) => !previousTerms.has(normalize(term)));
}

function uniqueBounded(values: string[], limit: number): string[] {
  const seen = new Set<string>();
  const unique: string[] = [];

  for (const value of values) {
    const trimmed = value.trim();
    const key = normalize(trimmed);
    if (!trimmed || seen.has(key)) continue;

    seen.add(key);
    unique.push(trimmed);
    if (unique.length >= limit) break;
  }

  return unique;
}

function normalize(value: string): string {
  return value.trim().toLocaleLowerCase("es-SV");
}
