import { google } from "@ai-sdk/google";
import { generateObject } from "ai";
import { lessonStateSchema, type LessonState } from "./lessonState.schema.js";

const DEFAULT_LESSON_STATE_MODEL = "gemini-2.0-flash";
const MAX_TRANSCRIPT_CHARS = 8_000;

export interface BuildLessonStateInput {
  /** Concatenated transcript text from the last 1-2 audio chunks. */
  transcriptText: string;
  /** Optional context to keep the model anchored, e.g. previous lesson_state. */
  previousLessonState?: LessonState | null;
  model?: string;
}

/**
 * Area A, stage 2: raw transcript never travels past this point (per the
 * product spec) — everything downstream reads lesson_state instead.
 */
export async function buildLessonState(
  input: BuildLessonStateInput,
): Promise<LessonState> {
  const transcriptText = normalizeTranscriptText(input.transcriptText);
  if (!transcriptText) {
    throw new Error("buildLessonState: transcriptText is required");
  }

  const { object } = await generateObject({
    model: google(input.model ?? DEFAULT_LESSON_STATE_MODEL),
    schema: lessonStateSchema,
    prompt: [
      "You are analyzing a short slice of a 7th-grade Lenguaje class transcript in El Salvador.",
      "Infer the current topic, likely curriculum objective, key vocabulary, and your confidence.",
      "Use Spanish for every user-facing field. Keep quoted_phrases short and copy them verbatim from the transcript.",
      "If the transcript is noisy or unrelated to class content, lower confidence instead of inventing an objective.",
      "",
      input.previousLessonState
        ? `Previous lesson_state (for continuity, may still be accurate): ${JSON.stringify(input.previousLessonState)}`
        : "No previous lesson_state yet — this is the first segment.",
      "",
      `Transcript segment:\n"""\n${transcriptText}\n"""`,
    ].join("\n"),
  });

  return lessonStateSchema.parse({
    ...object,
    topic: object.topic.trim(),
    objective_guess: object.objective_guess?.trim() || null,
    key_terms: uniqueTerms(object.key_terms),
    transcript_summary: object.transcript_summary.trim(),
    evidence: {
      quoted_phrases: object.evidence.quoted_phrases.map((phrase) => phrase.trim()).filter(Boolean),
      reason: object.evidence.reason.trim(),
    },
  });
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
  const topic = input.topic.trim();
  const objective = input.objective?.trim();
  if (!topic) {
    throw new Error("lessonStateFromManualEntry: topic is required");
  }

  return {
    topic,
    objective_guess: objective || null,
    key_terms: [],
    transcript_summary: topic,
    confidence: 1,
    evidence: {
      quoted_phrases: [],
      reason: "Manual entry by teacher (transcription fallback, D6).",
    },
  };
}

function normalizeTranscriptText(value: string): string {
  return value.trim().slice(-MAX_TRANSCRIPT_CHARS);
}

function uniqueTerms(terms: string[]): string[] {
  const seen = new Set<string>();
  const unique: string[] = [];

  for (const term of terms) {
    const normalized = term.trim();
    const key = normalized.toLocaleLowerCase("es-SV");
    if (!normalized || seen.has(key)) continue;

    seen.add(key);
    unique.push(normalized);
  }

  return unique;
}
