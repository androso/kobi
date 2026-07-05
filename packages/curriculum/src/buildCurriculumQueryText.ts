export interface LessonStateQueryInput {
  topic: string;
  objective_guess?: string | null;
  key_terms?: string[];
  transcript_summary?: string;
}

/**
 * Turns Area A's lesson_state into the retrieval query Area B embeds.
 * Weighted by repetition on purpose: objective/topic should dominate noisy
 * transcript summaries and incidental vocabulary.
 */
export function buildCurriculumQueryText(lessonState: LessonStateQueryInput): string {
  const parts = [
    lessonState.objective_guess,
    lessonState.topic,
    lessonState.topic,
    ...(lessonState.key_terms ?? []),
    lessonState.transcript_summary,
  ];

  const queryText = parts
    .map((part) => part?.trim())
    .filter((part): part is string => Boolean(part))
    .join(" ");

  if (!queryText) {
    throw new Error("buildCurriculumQueryText: lesson_state did not contain searchable text");
  }

  return queryText;
}
