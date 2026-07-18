import type { LessonState } from "@kobi/ai-core";

export const silentLessonState: LessonState = {
  topic: "Sin contenido hablado",
  objective_guess: null,
  key_terms: [],
  transcript_summary: "El audio procesado no contiene habla transcribible.",
  confidence: 0,
  evidence: {
    quoted_phrases: [],
    reason: "Los fragmentos procesados solo contienen silencio.",
  },
};

export function isSilentLessonState(lessonState: LessonState) {
  return (
    lessonState.confidence === silentLessonState.confidence &&
    lessonState.topic === silentLessonState.topic &&
    lessonState.transcript_summary === silentLessonState.transcript_summary
  );
}
