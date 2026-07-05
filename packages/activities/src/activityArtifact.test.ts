import { describe, expect, it } from "vitest";
import type { LessonState } from "@kobi/ai-core";
import type { CurriculumMatch } from "@kobi/curriculum";
import {
  activitySdkMessageSchema,
  buildActivitySessionContext,
  createActivityArtifactCandidates,
  resolveApprovedActivityForBand,
  verifyActivityArtifact,
} from "./index.js";

const lessonState: LessonState = {
  topic: "La noticia y sus partes",
  objective_guess: "Identificar titular, entradilla y fuente en una noticia breve",
  key_terms: ["titular", "entradilla", "fuente", "hecho principal"],
  transcript_summary:
    "La docente explicó las partes de una noticia con ejemplos del periódico escolar.",
  confidence: 0.88,
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
];

describe("activity artifact contracts", () => {
  it("builds bounded session context from lesson_state only", () => {
    const context = buildActivitySessionContext([lessonState]);

    expect(context.latest_topic).toBe("La noticia y sus partes");
    expect(context.vocabulary).toContain("titular");
    expect(JSON.stringify(context)).not.toContain("periódico escolar");
  });

  it("creates three verified HTML artifact candidates", () => {
    const context = buildActivitySessionContext([lessonState]);
    const candidates = createActivityArtifactCandidates({
      lessonState,
      sessionContext: context,
      curriculumMatches,
    });

    expect(candidates).toHaveLength(3);
    expect(candidates.map((candidate) => candidate.manifest.difficulty_band)).toEqual([
      "support",
      "core",
      "challenge",
    ]);

    for (const candidate of candidates) {
      const result = verifyActivityArtifact(candidate);
      expect(result.ok).toBe(true);
      expect(result.artifact.status).toBe("verified");
      expect(result.artifact.evidence[0].objective_code).toBe("L7.4.2");
    }
  });

  it("validates SDK telemetry messages", () => {
    const result = activitySdkMessageSchema.safeParse({
      sdk: "activity-sdk/v1",
      type: "event",
      method: "reportAttempt",
      payload: {
        assignment_id: "assignment-1",
        item_index: 0,
        correct: true,
      },
    });

    expect(result.success).toBe(true);
  });

  it("falls back to approved core activity for unapproved bands", () => {
    const approvals = [
      { difficulty_band: "core" as const, activity_id: "activity-core", approved: true },
      { difficulty_band: "challenge" as const, activity_id: "activity-challenge", approved: false },
    ];

    expect(resolveApprovedActivityForBand(approvals, "challenge")?.activity_id).toBe("activity-core");
    expect(resolveApprovedActivityForBand(approvals, "support")?.activity_id).toBe("activity-core");
  });
});
