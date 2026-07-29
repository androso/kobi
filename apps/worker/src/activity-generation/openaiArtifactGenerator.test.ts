import { describe, expect, it } from "vitest";
import { zodTextFormat } from "openai/helpers/zod";
import type { LessonState } from "@kobi/ai-core";
import type { CurriculumMatch } from "@kobi/curriculum";
import type { DifficultyBand, SessionContext } from "@kobi/activities/contracts";
import {
  buildActivityGenerationPrompt,
  createActivitySetId,
  generateOpenAiActivityCandidates,
  normalizeOpenAiActivityDrafts,
  openAiActivityDraftResponseSchema,
  openAiActivityReviewResponseSchema,
  type OpenAiActivityDraftClient,
  type OpenAiActivityDraftRequest,
} from "./openaiArtifactGenerator.js";

const lessonState: LessonState = {
  topic: "La noticia y sus partes",
  objective_guess: "Identificar titular, entradilla y fuente en una noticia breve",
  key_terms: ["titular", "entradilla", "fuente"],
  transcript_summary: "RAW TRANSCRIPT SHOULD NOT LEAVE AREA A",
  confidence: 0.88,
  evidence: {
    quoted_phrases: ["Maria Perez leyo la noticia completa"],
    reason: "La clase se centro en reconocer partes de una noticia.",
  },
};

const sessionContext: SessionContext = {
  latest_topic: "La noticia y sus partes",
  latest_objective: "Identificar titular, entradilla y fuente",
  vocabulary: ["titular", "entradilla", "fuente"],
  examples_used: ["Maria Perez dijo titular de la noticia"],
  misconceptions: [],
  time_remaining_minutes: 10,
  confidence: 0.88,
  segment_count: 1,
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
const activitySetId = "set-test-run";

describe("OpenAI activity artifact generator", () => {
  it("builds a Structured Outputs format with every draft and review field required", () => {
    expect(() =>
      zodTextFormat(openAiActivityDraftResponseSchema, "kobi_activity_artifacts"),
    ).not.toThrow();
    expect(() =>
      zodTextFormat(openAiActivityReviewResponseSchema, "kobi_activity_review"),
    ).not.toThrow();
  });

  it("creates a unique server-owned set id for each orchestration run", () => {
    expect(createActivitySetId()).not.toBe(createActivitySetId());
  });

  it("normalizes a valid raw DTO into server-derived ActivityArtifactCandidates", () => {
    const result = normalizeOpenAiActivityDrafts(
      { artifacts: [rawArtifact("core")] },
      {
        lessonState,
        sessionContext,
        curriculumMatches,
        bands: ["core"],
        activitySetId,
        parentIdByBand: { core: "parent-1" },
      },
      () => "artifact-bundles/test/index.html",
    );

    expect(result.errors).toEqual([]);
    expect(result.candidates).toHaveLength(1);
    expect(result.candidates[0]).toMatchObject({
      contract_version: "activity-artifact/v1",
      bundle_ref: "artifact-bundles/test/index.html",
      parent_id: "parent-1",
      status: "candidate",
      manifest: {
        difficulty_band: "core",
        curriculum: {
          objective: "L7.4.2",
          unit: "U4",
          grade: 7,
          subject: "lenguaje",
        },
      },
      evidence: [{ objective_code: "L7.4.2" }],
    });
    expect(result.candidates[0].manifest.content.telemetry_events).toEqual([
      "attempt",
      "hint",
      "complete",
    ]);
  });
  it("preserves a novel model-provided family and mechanic", () => {
    const result = normalizeOpenAiActivityDrafts(
      {
        artifacts: [
          rawArtifact("core", {
            family: "sequence_order",
            mechanic: "headline_workshop",
          }),
        ],
      },
      { lessonState, sessionContext, curriculumMatches, bands: ["core"], activitySetId },
    );

    expect(result.errors).toEqual([]);
    expect(result.candidates[0]?.manifest).toMatchObject({
      family: "sequence_order",
      mechanic: "headline_workshop",
    });
  });

  it("rejects invalid mechanic slugs from model output", () => {
    const result = normalizeOpenAiActivityDrafts(
      { artifacts: [rawArtifact("core", { mechanic: "Headline Workshop" })] },
      { lessonState, sessionContext, curriculumMatches, bands: ["core"], activitySetId },
    );

    expect(result.candidates).toEqual([]);
    expect(result.errors.some((error) => error.includes("snake_case slug"))).toBe(true);
  });

  it("rejects a draft response with mixed families", () => {
    const result = normalizeOpenAiActivityDrafts(
      {
        artifacts: [
          rawArtifact("support", { family: "guided_practice", mechanic: "headline_workshop" }),
          rawArtifact("core", { family: "sequence_order", mechanic: "headline_workshop" }),
          rawArtifact("challenge", { family: "guided_practice", mechanic: "headline_workshop" }),
        ],
      },
      {
        lessonState,
        sessionContext,
        curriculumMatches,
        bands: ["support", "core", "challenge"],
        activitySetId,
      },
    );

    expect(result.candidates).toEqual([]);
    expect(result.errors).toContain(
      "draft schema: all requested bands must share one family and mechanic",
    );
  });

  it("rejects a draft response with mixed mechanics", () => {
    const result = normalizeOpenAiActivityDrafts(
      {
        artifacts: [
          rawArtifact("support", { mechanic: "headline_workshop" }),
          rawArtifact("core", { mechanic: "source_check_desk" }),
          rawArtifact("challenge", { mechanic: "headline_workshop" }),
        ],
      },
      {
        lessonState,
        sessionContext,
        curriculumMatches,
        bands: ["support", "core", "challenge"],
        activitySetId,
      },
    );

    expect(result.candidates).toEqual([]);
    expect(result.errors).toContain(
      "draft schema: all requested bands must share one family and mechanic",
    );
  });

  it("normalizes nullable OpenAI telemetry events to the optional manifest field", () => {
    const result = normalizeOpenAiActivityDrafts(
      { artifacts: [rawArtifact("support", { telemetryEvents: null })] },
      {
        lessonState,
        sessionContext,
        curriculumMatches,
        bands: ["support"],
        activitySetId,
      },
      () => "artifact-bundles/test/index.html",
    );

    expect(result.errors).toEqual([]);
    expect(result.candidates).toHaveLength(1);
    expect(result.candidates[0].manifest.content.telemetry_events).toBeUndefined();
  });

  it("rejects model-supplied trusted fields", () => {
    const result = normalizeOpenAiActivityDrafts(
      {
        artifacts: [
          {
            ...rawArtifact("support"),
            bundle_ref: "artifact-bundles/model-controlled/index.html",
          },
        ],
      },
      { lessonState, sessionContext, curriculumMatches, bands: ["support"], activitySetId },
    );

    expect(result.candidates).toHaveLength(0);
    expect(result.errors.length).toBeGreaterThan(0);
  });

  it("reports requested bands that are missing from a parsed draft response", () => {
    const result = normalizeOpenAiActivityDrafts(
      { artifacts: [rawArtifact("support")] },
      { lessonState, sessionContext, curriculumMatches, bands: ["support", "core"], activitySetId },
    );

    expect(result.candidates).toHaveLength(1);
    expect(result.errors).toContain("draft schema: missing requested difficulty band core");
  });

  it("removes a model-provided CSP so the host owns the runtime policy", () => {
    const permissiveHtml = validHtml("Actividad core", "Responde sobre la noticia en nivel core.")
      .replace(
        "<head>",
        '<head><meta http-equiv="Content-Security-Policy" content="default-src *; connect-src *">',
      );
    const result = normalizeOpenAiActivityDrafts(
      { artifacts: [{ ...rawArtifact("core"), index_html: permissiveHtml }] },
      { lessonState, sessionContext, curriculumMatches, bands: ["core"], activitySetId },
    );

    expect(result.candidates).toHaveLength(1);
    expect(result.candidates[0].bundle_html).not.toContain("Content-Security-Policy");
    expect(result.candidates[0].bundle_html).not.toContain("default-src *");
  });

  it("rejects unsafe HTML before returning candidates for persistence", async () => {
    const client = mockClient([
      { artifacts: [{ ...rawArtifact("core"), index_html: validHtml("Unsafe", "Prompt").replace("</script>", "fetch('/x');</script>") }] },
    ]);

    const result = await generateOpenAiActivityCandidates(
      { lessonState, sessionContext, curriculumMatches, bands: ["core"], activitySetId },
      {
        client,
        model: "gpt-5.5",
        templates: { system: "system", repair: "repair", review: "review" },
        maxRepairAttempts: 0,
        maxReviewRepairAttempts: 0,
      },
    );

    expect(result.attempts).toBe(1);
    expect(result.candidates).toHaveLength(0);
    expect(result.errors.some((error) => error.includes("network fetch is forbidden"))).toBe(true);
  });

  it("uses exactly one repair attempt after verifier errors", async () => {
    const client = mockClient([
      { artifacts: [{ ...rawArtifact("challenge"), index_html: "<!doctype html><html><script></script></html>" }] },
      { artifacts: [rawArtifact("challenge")] },
    ]);

    const result = await generateOpenAiActivityCandidates(
      { lessonState, sessionContext, curriculumMatches, bands: ["challenge"], activitySetId },
      {
        client,
        model: "gpt-5.5",
        templates: { system: "system", repair: "repair", review: "review" },
        bundleRefFactory: () => "artifact-bundles/repaired/index.html",
      },
    );

    expect(client.calls).toBe(2);
    expect(result.attempts).toBe(2);
    expect(result.candidates).toHaveLength(1);
  });

  it("retries missing bands from a partial repair response", async () => {
    const client = mockClient([
      { artifacts: [{ ...rawArtifact("support"), index_html: "<!doctype html><html><script></script></html>" }] },
      { artifacts: [rawArtifact("support")] },
      { artifacts: [rawArtifact("core")] },
    ]);

    const result = await generateOpenAiActivityCandidates(
      { lessonState, sessionContext, curriculumMatches, bands: ["support", "core"], activitySetId },
      {
        client,
        model: "gpt-5.5",
        templates: { system: "system", repair: "repair", review: "review" },
      },
    );

    expect(client.calls).toBe(3);
    expect(result.attempts).toBe(3);
    expect(result.candidates.map((candidate) => candidate.manifest.difficulty_band)).toEqual([
      "support",
      "core",
    ]);
    expect(result.errors).toContain("draft schema: missing requested difficulty band core");
  });
  it("rejects mixed metadata introduced across repair attempts before AI review", async () => {
    const client = mockClient([
      {
        artifacts: [
          rawArtifact("support", {
            family: "guided_practice",
            mechanic: "headline_workshop",
          }),
        ],
      },
      {
        artifacts: [
          rawArtifact("core", {
            family: "guided_practice",
            mechanic: "source_check_desk",
          }),
        ],
      },
    ]);

    const result = await generateOpenAiActivityCandidates(
      {
        lessonState,
        sessionContext,
        curriculumMatches,
        bands: ["support", "core"],
        activitySetId,
      },
      {
        client,
        model: "gpt-5.5",
        templates: { system: "system", repair: "repair", review: "review" },
        maxRepairAttempts: 1,
      },
    );

    expect(result.candidates).toEqual([]);
    expect(client.reviewCalls).toBe(0);
    expect(result.errors.some((error) => error.includes("must share one family and mechanic"))).toBe(
      true,
    );
  });

  it("sends fresh verifier errors after each failed repair", async () => {
    const client = mockClient([
      { artifacts: [{ ...rawArtifact("core"), index_html: "<!doctype html><html><script></script></html>" }] },
      { artifacts: [{ ...rawArtifact("core"), index_html: validHtml("Actividad core", "Responde sobre la noticia en nivel core.").replace("</script>", "fetch('/x');</script>") }] },
      { artifacts: [rawArtifact("core")] },
    ]);

    const result = await generateOpenAiActivityCandidates(
      { lessonState, sessionContext, curriculumMatches, bands: ["core"], activitySetId },
      {
        client,
        model: "gpt-5.5",
        templates: { system: "system", repair: "repair", review: "review" },
        maxRepairAttempts: 2,
      },
    );

    const thirdPrompt = JSON.parse(client.requests[2].userPrompt);

    expect(result.candidates).toHaveLength(1);
    expect(thirdPrompt.verifier_errors.core).toContain("network fetch is forbidden");
    expect(thirdPrompt.verifier_errors.core).not.toContain("bundle is missing SDK hook: getManifest");
  });

  it("fails closed when the structured AI review rejects a generated set", async () => {
    const client = mockClient(
      [{ artifacts: [rawArtifact("core")] }],
      [{
        approved: false,
        findings: [{
          difficulty_band: "core",
          category: "answer_correctness",
          severity: "error",
          message: "La respuesta no esta respaldada por la evidencia.",
        }],
      }],
    );

    const result = await generateOpenAiActivityCandidates(
      { lessonState, sessionContext, curriculumMatches, bands: ["core"], activitySetId },
      {
        client,
        model: "gpt-5.5",
        templates: { system: "system", repair: "repair", review: "review" },
        maxRepairAttempts: 0,
        maxReviewRepairAttempts: 0,
      },
    );

    expect(client.reviewCalls).toBe(1);
    expect(result.candidates).toEqual([]);
    expect(result.errors.some((error) => error.includes("answer_correctness"))).toBe(true);
  });

  it("repairs only review-rejected bands and reviews the coherent set again", async () => {
    const client = mockClient(
      [
        { artifacts: [rawArtifact("core")] },
        { artifacts: [rawArtifact("core")] },
      ],
      [
        {
          approved: false,
          findings: [{
            difficulty_band: "core",
            category: "usability",
            severity: "error",
            message: "Bloquea los controles despues de enviar.",
          }],
        },
        { approved: true, findings: [] },
      ],
    );

    const result = await generateOpenAiActivityCandidates(
      { lessonState, sessionContext, curriculumMatches, bands: ["core"], activitySetId },
      {
        client,
        model: "gpt-5.5",
        templates: { system: "system", repair: "repair", review: "review" },
        maxRepairAttempts: 1,
      },
    );

    expect(client.calls).toBe(2);
    expect(client.reviewCalls).toBe(2);
    expect(result.attempts).toBe(2);
    expect(result.candidates).toHaveLength(1);
    expect(result.errors).toEqual([]);
    expect(result.diagnostics).toContain(
      "AI review error core/usability: Bloquea los controles despues de enviar.",
    );
    expect(JSON.parse(client.requests[1].userPrompt).verifier_errors.core).toContain(
      "AI review error core/usability: Bloquea los controles despues de enviar.",
    );
  });
  it("reports non-blocking review findings as diagnostics rather than terminal errors", async () => {
    const client = mockClient(
      [{ artifacts: [rawArtifact("support")] }],
      [{
        approved: true,
        findings: [{
          difficulty_band: "support",
          category: "adaptive_support",
          severity: "warning",
          message: "La pista puede ser mas especifica.",
        }],
      }],
    );

    const result = await generateOpenAiActivityCandidates(
      { lessonState, sessionContext, curriculumMatches, bands: ["support"], activitySetId },
      {
        client,
        model: "gpt-5.5",
        templates: { system: "system", repair: "repair", review: "review" },
      },
    );

    expect(result.candidates).toHaveLength(1);
    expect(result.errors).toEqual([]);
    expect(result.diagnostics).toEqual([
      "AI review warning support/adaptive_support: La pista puede ser mas especifica.",
    ]);
  });
  it("uses remaining repair budget when a review repair fails deterministic verification", async () => {
    const client = mockClient(
      [
        { artifacts: [rawArtifact("challenge")] },
        { artifacts: [{ ...rawArtifact("challenge"), index_html: "<!doctype html><html><script></script></html>" }] },
        { artifacts: [rawArtifact("challenge")] },
      ],
      [
        {
          approved: false,
          findings: [{
            difficulty_band: "challenge",
            category: "usability",
            severity: "error",
            message: "La interaccion necesita feedback verificable.",
          }],
        },
        { approved: true, findings: [] },
      ],
    );

    const result = await generateOpenAiActivityCandidates(
      { lessonState, sessionContext, curriculumMatches, bands: ["challenge"], activitySetId },
      {
        client,
        model: "gpt-5.5",
        templates: { system: "system", repair: "repair", review: "review" },
        maxRepairAttempts: 2,
      },
    );

    expect(client.calls).toBe(3);
    expect(client.reviewCalls).toBe(2);
    expect(result.candidates).toHaveLength(1);
    expect(JSON.parse(client.requests[2].userPrompt).verifier_errors.challenge).toContain(
      "bundle is missing SDK hook: getManifest",
    );
  });
  it("keeps raw transcript and likely student names out of prompt input", () => {
    const prompt = buildActivityGenerationPrompt({
      lessonState,
      sessionContext,
      curriculumMatches,
      bands: ["core"],
      activitySetId,
    });

    expect(prompt).not.toContain("RAW TRANSCRIPT SHOULD NOT LEAVE AREA A");
    expect(prompt).not.toContain("Maria Perez");
    expect(prompt).toContain("[nombre]");
  });

  it("includes a creativity brief for interactive artifact design", () => {
    const prompt = buildActivityGenerationPrompt({
      lessonState,
      sessionContext,
      curriculumMatches,
      bands: ["support", "core", "challenge"],
      activitySetId,
    });
    const parsed = JSON.parse(prompt);

    expect(parsed.artifact_contract.family_exemplars).toEqual([
      "match_classify",
      "sequence_order",
      "guided_practice",
    ]);
    expect(parsed.artifact_contract.family_policy).toContain("not a renderer whitelist");
    expect(parsed.artifact_contract.metadata_contract.mechanic).toContain(
      "required snake_case mechanic slug",
    );
    expect(parsed.creativity_brief.design_goal).toContain("mini-app");
    expect(parsed.creativity_brief.skill_focus).toContain("concrete student ability");
    expect(parsed.creativity_brief.interaction_patterns).toContain("evidence map");
    expect(parsed.creativity_brief.band_differentiation.challenge).toContain("synthesize");
    expect(parsed.creativity_brief.avoid).toContain(
      "primary interaction that is multi-option / A/B/C / radio-button Q&A",
    );
    expect(parsed.sdk.exact_message_protocol.request).toContain(
      'type: "request"',
    );
    expect(parsed.sdk.exact_message_protocol.event).toContain(
      'type: "event"',
    );
    expect(parsed.sdk.completion_score_contract.count).toContain("score_unit=count");
    expect(parsed.sdk.completion_score_contract.normalized).toContain("score_unit=normalized");
    expect(parsed.sdk.completion_score_contract.submit_once).toContain("first valid reportComplete");
  });

  it("uses the supplied adapted game plan in the generation prompt", () => {
    const prompt = buildActivityGenerationPrompt({
      lessonState,
      sessionContext,
      curriculumMatches,
      bands: ["support", "core", "challenge"],
      activitySetId,
      gamePlan: {
        family: "sequence_order",
        mechanic: "timeline_builder",
        learning_goal: "Ordenar los hechos de la noticia.",
        interaction_metaphor: "linea de tiempo",
        kobi_visual_direction: "Azul Kobi",
        rationale: "Conserva el mecanismo de la actividad padre.",
        band_requirements: {
          support: "Dos pasos guiados.",
          core: "Tres pasos.",
          challenge: "Cuatro pasos con justificacion.",
        },
      },
    });
    const parsed = JSON.parse(prompt);

    expect(parsed.artifact_contract.required_shared_game_plan).toMatchObject({
      family: "sequence_order",
      mechanic: "timeline_builder",
      interaction_metaphor: "linea de tiempo",
    });
  });
});

function rawArtifact(
  band: DifficultyBand,
  options: {
    telemetryEvents?: Array<"attempt" | "hint" | "complete"> | null;
    family?: "match_classify" | "sequence_order" | "guided_practice";
    mechanic?: string;
  } = {},
) {
  const title = `Actividad ${band}`;
  const prompt = `Responde sobre la noticia en nivel ${band}.`;
  return {
    difficulty_band: band,
    manifest_draft: {
      family: options.family ?? "guided_practice",
      mechanic: options.mechanic ?? "source_check_desk",
      title,
      est_minutes: 6,
      allowed_capabilities: ["dom", "css"],
      experience: {
        type: "guided_inquiry",
        assessment_mode: "mastery",
        interaction_model: "Clasificar partes de una noticia con feedback inmediato.",
        adaptive_features: ["Pista contextual despues de un error."],
      },
      learning_design: {
        learning_goal: "Reconocer las partes de una noticia.",
        interaction_summary: "Verifica las partes de una noticia en una mesa interactiva.",
        success_criteria: ["Identifica el titular correctamente."],
      },
      visual_theme: {
        scene: "mesa de verificacion",
        accent: "azul Kobi",
      },
      content: {
        items: [
          {
            prompt,
            answer_key: ["titular"],
            hints: ["Busca la parte que presenta el hecho principal."],
          },
        ],
        telemetry_events:
          "telemetryEvents" in options
            ? options.telemetryEvents
            : ["attempt", "hint", "complete"],
      },
    },
    index_html: validHtml(title, prompt),
  };
}

function validHtml(_title: string, _prompt: string) {
  return `<!doctype html>
<html lang="es">
<head><meta charset="utf-8"><title>Actividad interactiva</title></head>
<body>
  <main id="app" aria-live="polite">Cargando actividad...</main>
  <button id="attempt" type="button">Responder</button>
  <button id="hint" type="button">Pista</button>
  <button id="complete" type="button">Completar</button>
  <script>
    const SDK_VERSION = "activity-sdk/v1";
    let manifest;
    let band;
    function emit(method, payload) {
      window.parent.postMessage({ sdk: SDK_VERSION, type: "event", method, payload }, "*");
    }
    function request(id, method) {
      window.parent.postMessage({ sdk: SDK_VERSION, type: "request", id, method }, "*");
    }
    function getManifest() { request("manifest", "getManifest"); }
    function getBand() { request("band", "getBand"); }
    function reportAttempt(payload) { emit("reportAttempt", payload); }
    function reportHint(payload) { emit("reportHint", payload); }
    function reportComplete(payload) { emit("reportComplete", payload); }
    function render() {
      if (!manifest || !band) return;
      const item = manifest.content.items[0];
      document.getElementById("app").innerHTML =
        "<h1>" + manifest.title + "</h1><p class=\"prompt\">" + item.prompt + "</p><button class=\"option\" type=\"button\">Elegir</button>";
      document.querySelector(".option").addEventListener("click", () => reportAttempt({ assignment_id: "assignment-1", item_index: 0, correct: true }));
    }
    addEventListener("message", (event) => {
      if (!event.data || event.data.type !== "response") return;
      if (event.data.id === "manifest") manifest = event.data.result;
      if (event.data.id === "band") band = event.data.result;
      render();
    });
    document.getElementById("attempt").addEventListener("click", () => reportAttempt({ assignment_id: "assignment-1", item_index: 0, correct: true }));
    document.getElementById("hint").addEventListener("click", () => reportHint({ assignment_id: "assignment-1", item_index: 0, hint_index: 0 }));
    document.getElementById("complete").addEventListener("click", () => reportComplete({ assignment_id: "assignment-1", score_unit: "count", score: 1, total: 1 }));
    getManifest();
    getBand();
  </script>
</body>
</html>`;
}

function mockClient(
  responses: unknown[],
  reviewResponses: unknown[] = [{ approved: true, findings: [] }],
): OpenAiActivityDraftClient & {
  calls: number;
  reviewCalls: number;
  requests: OpenAiActivityDraftRequest[];
} {
  return {
    calls: 0,
    reviewCalls: 0,
    requests: [],
    async generateActivityDrafts(request) {
      this.requests.push(request);
      const response = responses[this.calls];
      this.calls += 1;
      return response;
    },
    async reviewActivityCandidates() {
      const response = reviewResponses[this.reviewCalls] ?? reviewResponses.at(-1);
      this.reviewCalls += 1;
      return response;
    },
  };
}
