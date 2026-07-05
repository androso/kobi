/**
 * Artifact content contract.
 *
 * This is the shape the backend returns for each published artifact and that the
 * student client renders — analogous to how Claude artifacts render typed
 * content. `ArtifactContent` is a discriminated union keyed by `type`, so new
 * artifact kinds (reading, video, …) can be added without touching existing
 * renderers: add a member here and a case in `ArtifactRenderer`.
 *
 * Example payload for a quiz:
 *
 * {
 *   "type": "quiz",
 *   "questions": [
 *     {
 *       "id": "q1",
 *       "prompt": "El periodista redacto la ___ antes del mediodia.",
 *       "choices": [
 *         { "id": "a", "label": "noticia" },
 *         { "id": "b", "label": "novela" },
 *         { "id": "c", "label": "receta" }
 *       ],
 *       "correctChoiceId": "a",
 *       "hints": ["Piensa en lo que escribe un periodista."],
 *       "explanation": "Una noticia es un texto informativo."
 *     }
 *   ]
 * }
 */

export type ArtifactKind = "quiz" | "reading" | "video";

export interface QuizChoice {
  id: string;
  label: string;
}

export interface QuizQuestion {
  id: string;
  prompt: string;
  choices: QuizChoice[];
  correctChoiceId: string;
  hints?: string[];
  explanation?: string;
}

export interface QuizContent {
  type: "quiz";
  questions: QuizQuestion[];
}

/** Extension points — typed now, rendered when the backend starts sending them. */
export interface ReadingContent {
  type: "reading";
  body: string;
}

export interface VideoContent {
  type: "video";
  url: string;
  durationLabel?: string;
}

export type ArtifactContent = QuizContent | ReadingContent | VideoContent;

/** A single answer within a quiz submission. */
export interface QuizAnswer {
  questionId: string;
  choiceId: string;
  correct: boolean;
}
