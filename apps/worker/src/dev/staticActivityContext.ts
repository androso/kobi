import type { LessonState } from "@kobi/ai-core";
import type { CurriculumMatch } from "@kobi/curriculum";
import type { GenerateActivityArtifactsJobData } from "../jobs/generateActivityArtifacts.job.js";

const lessonState: LessonState = {
  topic: "La noticia y sus partes",
  objective_guess: "Identificar titular, entradilla, cuerpo y fuente en una noticia breve",
  key_terms: ["titular", "entradilla", "cuerpo", "fuente", "hecho principal"],
  transcript_summary:
    "La docente explicó la estructura de la noticia usando ejemplos del periódico escolar.",
  confidence: 0.9,
  evidence: {
    quoted_phrases: ["titular de la noticia", "la fuente nos dice quién informa"],
    reason: "La clase se centró en reconocer partes de una noticia.",
  },
};

const curriculumMatches: CurriculumMatch[] = [
  {
    objective_code: "L7.4.2",
    unit: "U4",
    grade: 7,
    subject: "lenguaje",
    text: "Reconoce la estructura de la noticia: titular, entradilla, cuerpo y fuente.",
    similarity: 0.91,
  },
  {
    objective_code: "L7.4.3",
    unit: "U4",
    grade: 7,
    subject: "lenguaje",
    text: "Distingue hechos, opiniones y fuentes de informacion en textos periodisticos.",
    similarity: 0.84,
  },
];

export const staticActivityContext = {
  sessionId: "00000000-0000-4000-8000-000000000001",
  lessonState,
  curriculumMatches,
} satisfies GenerateActivityArtifactsJobData;
