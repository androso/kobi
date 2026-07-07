/**
 * Student artifact metadata.
 *
 * Production delivery uses `verified_bundle`: a schema-validated
 * ActivityArtifact manifest plus self-contained HTML rendered in the sandboxed
 * iframe. The quiz/reading/video shapes are retained only for explicit
 * dev/demo/test fixtures.
 */

export type ArtifactKind = "verified_bundle" | "quiz" | "reading" | "video";

export interface VerifiedBundleContent {
  type: "verified_bundle";
  family: "match_classify" | "sequence_order" | "guided_practice";
}

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

export interface ReadingContent {
  type: "reading";
  body: string;
}

export interface VideoContent {
  type: "video";
  url: string;
  durationLabel?: string;
}

export type ArtifactContent = VerifiedBundleContent | QuizContent | ReadingContent | VideoContent;

/** A single answer within a legacy quiz submission. */
export interface QuizAnswer {
  questionId: string;
  choiceId: string;
  correct: boolean;
}
