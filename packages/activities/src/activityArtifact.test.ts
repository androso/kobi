import { describe, expect, it } from "vitest";
import type { LessonState } from "@kobi/ai-core";
import type { CurriculumMatch } from "@kobi/curriculum";
import {
  activitySdkMessageSchema,
  authorizeActivityTelemetryMessage,
  buildActivitySessionContext,
  createActivityArtifactCandidates,
  resolveApprovedActivityForBand,
  verifyActivityArtifact,
} from "./server.js";

const lessonState: LessonState = {
  topic: "La noticia y sus partes",
  objective_guess: "Identificar titular, entradilla y fuente en una noticia breve",
  key_terms: ["titular", "entradilla", "fuente", "hecho principal"],
  transcript_summary:
    "La docente explico las partes de una noticia con ejemplos del periodico escolar.",
  confidence: 0.88,
  evidence: {
    quoted_phrases: ["titular de la noticia", "la fuente nos dice quien informa"],
    reason: "La clase se centro en reconocer partes de una noticia.",
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
    expect(JSON.stringify(context)).not.toContain("periodico escolar");
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
      expect(candidate.bundle_html).not.toContain("preview-assignment");
      expect(candidate.bundle_html).not.toContain("assignment_id:");
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
      {
        difficulty_band: "core" as const,
        activity_id: "activity-core",
        candidate_id: "candidate-core",
        approved: true,
      },
      {
        difficulty_band: "challenge" as const,
        activity_id: "activity-challenge",
        candidate_id: "candidate-challenge",
        approved: false,
      },
    ];

    expect(resolveApprovedActivityForBand(approvals, "challenge")?.activity_id).toBe(
      "activity-core",
    );
    expect(resolveApprovedActivityForBand(approvals, "support")?.candidate_id).toBe(
      "candidate-core",
    );
    expect(resolveApprovedActivityForBand(approvals, "unknown")?.candidate_id).toBe(
      "candidate-core",
    );
  });

  it("authorizes telemetry from parent-owned assignment context", () => {
    const result = authorizeActivityTelemetryMessage(
      {
        sdk: "activity-sdk/v1",
        type: "event",
        method: "reportAttempt",
        payload: {
          assignment_id: "assignment-1",
          item_index: 0,
          correct: true,
        },
      },
      {
        assignmentId: "assignment-1",
        sourceMatches: true,
        eventOrigin: "https://kobi.test",
        allowedOrigin: "https://kobi.test",
      },
    );

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.event).toMatchObject({
      assignment_id: "assignment-1",
      type: "attempt",
    });
    expect(result.event.event_id).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i,
    );
  });

  it("assigns event ids in the parent and drops iframe-supplied ids", () => {
    const result = authorizeActivityTelemetryMessage(
      {
        sdk: "activity-sdk/v1",
        type: "event",
        method: "reportAttempt",
        payload: {
          assignment_id: "assignment-1",
          event_id: "00000000-0000-4000-8000-000000000000",
          item_index: 0,
          correct: true,
        },
      },
      { assignmentId: "assignment-1", sourceMatches: true },
    );

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.event.event_id).not.toBe("00000000-0000-4000-8000-000000000000");
    expect(result.event.payload).not.toHaveProperty("event_id");
  });

  it("stamps missing telemetry assignment ids from parent context", () => {
    const result = authorizeActivityTelemetryMessage(
      {
        sdk: "activity-sdk/v1",
        type: "event",
        method: "reportHint",
        payload: {
          item_index: 0,
          hint_index: 0,
        },
      },
      {
        assignmentId: "assignment-1",
        sourceMatches: true,
      },
    );

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.event).toMatchObject({
      assignment_id: "assignment-1",
      type: "hint",
      payload: {
        assignment_id: "assignment-1",
        item_index: 0,
        hint_index: 0,
      },
    });
  });

  it("rejects telemetry with spoofed assignment ids or rate-limit violations", () => {
    const spoofed = authorizeActivityTelemetryMessage(
      {
        sdk: "activity-sdk/v1",
        type: "event",
        method: "reportComplete",
        payload: {
          assignment_id: "other-assignment",
          score: 1,
          total: 1,
        },
      },
      {
        assignmentId: "assignment-1",
        sourceMatches: true,
      },
    );

    const rateLimited = authorizeActivityTelemetryMessage(
      {
        sdk: "activity-sdk/v1",
        type: "event",
        method: "reportHint",
        payload: {
          assignment_id: "assignment-1",
          item_index: 0,
          hint_index: 0,
        },
      },
      {
        assignmentId: "assignment-1",
        sourceMatches: true,
        eventsInRateWindow: 30,
      },
    );

    expect(spoofed.ok).toBe(false);
    expect(rateLimited.ok).toBe(false);
  });

  it("rejects artifacts that fail rubric thresholds", () => {
    const context = buildActivitySessionContext([lessonState]);
    const [candidate] = createActivityArtifactCandidates({
      lessonState,
      sessionContext: context,
      curriculumMatches,
    });
    candidate.manifest.content.items[0].hints = ["La respuesta es titular"];

    const result = verifyActivityArtifact(candidate);

    expect(result.ok).toBe(false);
    expect(result.artifact.status).toBe("rejected");
    expect(result.errors).toContain("rubric: hint_leakage 0.35 is below 0.80");
  });

  it("requires generated completion telemetry to use the manifest item count", () => {
    const context = buildActivitySessionContext([lessonState]);
    const [candidate] = createActivityArtifactCandidates({
      lessonState,
      sessionContext: context,
      curriculumMatches,
    });

    candidate.bundle_html = candidate.bundle_html.replace(
      "total: manifest.content.items.length",
      "total: manifest.content.items[0].answer_key.length",
    );

    const result = verifyActivityArtifact(candidate);

    expect(result.ok).toBe(false);
    expect(result.errors).toContain(
      "bundle completion total must equal manifest.content.items.length",
    );
  });
});
