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

  it("verifies a custom interactive artifact without exercise items", () => {
    const result = verifyActivityArtifact({
      contract_version: "activity-artifact/v1",
      manifest: {
        family: "custom_interactive",
        title: "Explora la piramide de la noticia",
        difficulty_band: "core",
        curriculum: {
          grade: 7,
          subject: "lenguaje",
          unit: "U4",
          objective: "L7.4.2",
        },
        est_minutes: 7,
        content: {
          description: "Manipula las partes de una noticia para ver como cambia la claridad del texto.",
          learning_goal: "Identificar como titular, entradilla, cuerpo y fuente organizan una noticia.",
          success_criteria: [
            "Reconoce cada parte de la noticia.",
            "Completa una version organizada con evidencia del texto.",
          ],
          telemetry_events: ["attempt", "hint", "complete"],
        },
        entry: "index.html",
        sdk_version: "activity-sdk/v1",
        allowed_capabilities: ["dom", "css", "svg"],
      },
      bundle_ref: "artifact-bundles/custom/index.html",
      bundle_html: validCustomInteractiveHtml(),
      verifier_scores: {
        deterministic: "fail",
        rubric: {
          curriculum_alignment: 0,
          age_fit: 0,
          duration_fit: 0,
          answer_correctness: 0,
          hint_leakage: 0,
          duplicate_risk: 0,
          spanish_suitability: 0,
        },
      },
      evidence: [{ objective_code: "L7.4.2", section: "U4 / L7.4.2", text: "La noticia" }],
      parent_id: null,
      status: "candidate",
    });

    expect(result.ok).toBe(true);
    expect(result.artifact.manifest.family).toBe("custom_interactive");
    expect(result.artifact.verifier_scores.rubric.answer_correctness).toBe(0.9);
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
    expect(resolveApprovedActivityForBand(approvals, "unknown")?.activity_id).toBe("activity-core");
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
        studentId: "student-1",
        sessionId: "session-1",
        sourceMatches: true,
        eventOrigin: "https://kobi.test",
        allowedOrigin: "https://kobi.test",
      },
    );

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.event).toMatchObject({
      assignment_id: "assignment-1",
      student_id: "student-1",
      session_id: "session-1",
      type: "attempt",
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
        studentId: "student-1",
        sessionId: "session-1",
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
        studentId: "student-1",
        sessionId: "session-1",
        sourceMatches: true,
        eventsInRateWindow: 30,
      },
    );

    expect(spoofed.ok).toBe(false);
    expect(rateLimited.ok).toBe(false);
  });
});

function validCustomInteractiveHtml() {
  return `<!doctype html>
<html lang="es">
<head><meta charset="utf-8"><title>Explora la piramide de la noticia</title></head>
<body>
  <h1>Explora la piramide de la noticia</h1>
  <p>Identificar como titular, entradilla, cuerpo y fuente organizan una noticia.</p>
  <button id="move">Mover parte</button>
  <button id="hint">Pista</button>
  <button id="complete">Completar</button>
  <script>
    const SDK_VERSION = "activity-sdk/v1";
    function emit(method, payload) {
      window.parent.postMessage({ sdk: SDK_VERSION, type: "event", method, payload }, "*");
    }
    function getManifest() { return {}; }
    function getBand() { return "core"; }
    function reportAttempt(payload) { emit("reportAttempt", payload); }
    function reportHint(payload) { emit("reportHint", payload); }
    function reportComplete(payload) { emit("reportComplete", payload); }
    document.getElementById("move").addEventListener("click", () => reportAttempt({ assignment_id: "assignment-1", item_index: 0, correct: true }));
    document.getElementById("hint").addEventListener("click", () => reportHint({ assignment_id: "assignment-1", item_index: 0, hint_index: 0 }));
    document.getElementById("complete").addEventListener("click", () => reportComplete({ assignment_id: "assignment-1", score: 1, total: 2 }));
  </script>
</body>
</html>`;
}
