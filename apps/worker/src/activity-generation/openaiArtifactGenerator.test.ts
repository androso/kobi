import { describe, expect, it } from "vitest";
import type { LessonState } from "@kobi/ai-core";
import type { CurriculumMatch } from "@kobi/curriculum";
import type { DifficultyBand, SessionContext } from "@kobi/activities";
import {
  buildActivityGenerationPrompt,
  generateOpenAiActivityCandidates,
  normalizeOpenAiActivityDrafts,
  type OpenAiActivityDraftClient,
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

describe("OpenAI activity artifact generator", () => {
  it("normalizes a valid raw DTO into server-derived ActivityArtifactCandidates", () => {
    const result = normalizeOpenAiActivityDrafts(
      { artifacts: [rawArtifact("core")] },
      {
        lessonState,
        sessionContext,
        curriculumMatches,
        bands: ["core"],
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
  });

  it("normalizes broader interactive manifest content without exercise items", () => {
    const result = normalizeOpenAiActivityDrafts(
      { artifacts: [rawCustomArtifact("challenge")] },
      { lessonState, sessionContext, curriculumMatches, bands: ["challenge"] },
      () => "artifact-bundles/custom/index.html",
    );

    expect(result.errors).toEqual([]);
    expect(result.candidates).toHaveLength(1);
    expect(result.candidates[0].manifest).toMatchObject({
      family: "exploratory_tool",
      difficulty_band: "challenge",
      content: {
        learning_goal: "Explorar como se ordenan las partes de una noticia.",
        success_criteria: ["Organiza una noticia clara.", "Explica por que el orden ayuda al lector."],
        telemetry_events: ["attempt", "hint", "complete"],
      },
    });
    expect(result.candidates[0].manifest.content.items).toBeUndefined();
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
      { lessonState, sessionContext, curriculumMatches, bands: ["support"] },
    );

    expect(result.candidates).toHaveLength(0);
    expect(result.errors.length).toBeGreaterThan(0);
  });

  it("rejects unsafe HTML before returning candidates for persistence", async () => {
    const client = mockClient([
      { artifacts: [{ ...rawArtifact("core"), index_html: validHtml("Unsafe", "Prompt").replace("</script>", "fetch('/x');</script>") }] },
    ]);

    const result = await generateOpenAiActivityCandidates(
      { lessonState, sessionContext, curriculumMatches, bands: ["core"] },
      {
        client,
        model: "gpt-5.5",
        templates: { system: "system", repair: "repair" },
        maxRepairAttempts: 0,
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
      { lessonState, sessionContext, curriculumMatches, bands: ["challenge"] },
      {
        client,
        model: "gpt-5.5",
        templates: { system: "system", repair: "repair" },
        bundleRefFactory: () => "artifact-bundles/repaired/index.html",
      },
    );

    expect(client.calls).toBe(2);
    expect(result.attempts).toBe(2);
    expect(result.candidates).toHaveLength(1);
  });

  it("keeps raw transcript and likely student names out of prompt input", () => {
    const prompt = buildActivityGenerationPrompt({
      lessonState,
      sessionContext,
      curriculumMatches,
      bands: ["core"],
    });

    expect(prompt).not.toContain("RAW TRANSCRIPT SHOULD NOT LEAVE AREA A");
    expect(prompt).not.toContain("Maria Perez");
    expect(prompt).toContain("[nombre]");
  });
});

function rawArtifact(band: DifficultyBand) {
  const title = `Actividad ${band}`;
  const prompt = `Responde sobre la noticia en nivel ${band}.`;
  return {
    difficulty_band: band,
    manifest_draft: {
      family: "guided_practice",
      title,
      est_minutes: 6,
      allowed_capabilities: ["dom", "css"],
      content: {
        items: [
          {
            prompt,
            answer_key: ["titular"],
            hints: ["Busca la parte que presenta el hecho principal."],
          },
        ],
      },
    },
    index_html: validHtml(title, prompt),
  };
}

function rawCustomArtifact(band: DifficultyBand) {
  const title = `Explorador ${band}`;
  const learningGoal = "Explorar como se ordenan las partes de una noticia.";
  return {
    difficulty_band: band,
    manifest_draft: {
      family: "exploratory_tool",
      title,
      est_minutes: 7,
      allowed_capabilities: ["dom", "css", "svg"],
      content: {
        description: "Mueve partes de una noticia y observa como cambia la claridad del texto.",
        learning_goal: learningGoal,
        success_criteria: [
          "Organiza una noticia clara.",
          "Explica por que el orden ayuda al lector.",
        ],
        telemetry_events: ["attempt", "hint", "complete"],
      },
    },
    index_html: validHtml(title, learningGoal),
  };
}

function validHtml(title: string, prompt: string) {
  return `<!doctype html>
<html lang="es">
<head><meta charset="utf-8"><title>${title}</title></head>
<body>
  <h1>${title}</h1>
  <p>${prompt}</p>
  <button id="attempt">Responder</button>
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
    document.getElementById("attempt").addEventListener("click", () => reportAttempt({ assignment_id: "assignment-1", item_index: 0, correct: true }));
    document.getElementById("hint").addEventListener("click", () => reportHint({ assignment_id: "assignment-1", item_index: 0, hint_index: 0 }));
    document.getElementById("complete").addEventListener("click", () => reportComplete({ assignment_id: "assignment-1", score: 1, total: 1 }));
  </script>
</body>
</html>`;
}

function mockClient(responses: unknown[]): OpenAiActivityDraftClient & { calls: number } {
  return {
    calls: 0,
    async generateActivityDrafts() {
      const response = responses[this.calls];
      this.calls += 1;
      return response;
    },
  };
}
