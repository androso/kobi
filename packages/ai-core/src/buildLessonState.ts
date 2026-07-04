import { google } from "@ai-sdk/google";
import { generateObject } from "ai";
import { lessonStateSchema, type LessonState } from "./lessonState.schema.js";

export interface BuildLessonStateInput {
  /** Concatenated transcript text from the last 1-2 audio chunks. */
  transcriptText: string;
  /** Optional context to keep the model anchored, e.g. previous lesson_state. */
  previousLessonState?: LessonState | null;
}

/**
 * Area A, stage 2: raw transcript never travels past this point (per the
 * product spec) — everything downstream reads lesson_state instead.
 */
export async function buildLessonState(
  input: BuildLessonStateInput,
): Promise<LessonState> {
  const { object } = await generateObject({
    model: google("gemini-2.0-flash"),
    schema: lessonStateSchema,
    prompt: [
      "You are analyzing a short slice of a 7th-grade Lenguaje class transcript in El Salvador.",
      "Infer the current topic, likely curriculum objective, key vocabulary, and your confidence.",
      "",
      input.previousLessonState
        ? `Previous lesson_state (for continuity, may still be accurate): ${JSON.stringify(input.previousLessonState)}`
        : "No previous lesson_state yet — this is the first segment.",
      "",
      `Transcript segment:\n"""\n${input.transcriptText}\n"""`,
    ].join("\n"),
  });

  return object;
}

/**
 * Converts the manual-fallback teacher input (D6: "No se detectó bien la
 * clase") into the same LessonState shape, so downstream consumers (Area B
 * retrieval, the teacher UI) never need a second code path.
 */
export function lessonStateFromManualEntry(input: {
  topic: string;
  objective?: string;
}): LessonState {
  return {
    topic: input.topic,
    objective_guess: input.objective ?? null,
    key_terms: [],
    transcript_summary: input.topic,
    confidence: 1,
    evidence: {
      quoted_phrases: [],
      reason: "Manual entry by teacher (transcription fallback, D6).",
    },
  };
}
