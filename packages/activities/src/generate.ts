import type { LessonState } from "@kobi/ai-core";
import type { CurriculumMatch } from "@kobi/curriculum";
import {
  ACTIVITY_ARTIFACT_CONTRACT_VERSION,
  ACTIVITY_SDK_VERSION,
  type ActivityArtifactCandidate,
  type ActivityManifest,
  type DifficultyBand,
  type SessionContext,
} from "./types.js";
import { evidenceFromCurriculumMatches } from "./sessionContext.js";
import { randomUUID } from "node:crypto";
import { createGamePlan, type GamePlan } from "./gamePlan.js";

export interface CreateActivityCandidatesInput {
  lessonState: LessonState;
  sessionContext: SessionContext;
  curriculumMatches: CurriculumMatch[];
  activitySetId: string;
  gamePlan?: GamePlan;
}

const bandSpecs: Record<
  DifficultyBand,
  { estMinutes: number; titlePrefix: string }
> = {
  support: {
    estMinutes: 5,
    titlePrefix: "Apoyo",
  },
  core: {
    estMinutes: 6,
    titlePrefix: "Practica",
  },
  challenge: {
    estMinutes: 7,
    titlePrefix: "Reto",
  },
};

export function createActivityArtifactCandidates(
  input: CreateActivityCandidatesInput,
): ActivityArtifactCandidate[] {
  if (input.curriculumMatches.length === 0) return [];

  const primaryMatch = input.curriculumMatches[0];
  const evidence = evidenceFromCurriculumMatches(input.curriculumMatches);
  const gamePlan = input.gamePlan ?? createGamePlan(input.sessionContext, input.curriculumMatches);

  return (["support", "core", "challenge"] as DifficultyBand[]).map((band) => {
    const spec = bandSpecs[band];
    const manifest: ActivityManifest = {
      family: gamePlan.family,
      mechanic: gamePlan.mechanic,
      title: `${spec.titlePrefix}: ${shortTitle(input.lessonState.topic)}`,
      difficulty_band: band,
      curriculum: {
        grade: primaryMatch.grade,
        subject: primaryMatch.subject,
        unit: primaryMatch.unit,
        objective: primaryMatch.objective_code,
      },
      est_minutes: spec.estMinutes,
      content: {
        items: buildItemsForBand(band, input.sessionContext, primaryMatch, gamePlan),
        telemetry_events: ["attempt", "hint", "complete"],
      },
      entry: "index.html",
      sdk_version: ACTIVITY_SDK_VERSION,
      allowed_capabilities: band === "challenge" ? ["dom", "css", "svg"] : ["dom", "css"],
      learning_design: {
        learning_goal: gamePlan.learning_goal,
        interaction_summary: `${gamePlan.interaction_metaphor}: ${gamePlan.band_requirements[band]}`,
        success_criteria: buildSuccessCriteria(band),
      },
      visual_theme: {
        scene: gamePlan.interaction_metaphor,
        accent: band === "support" ? "cielo" : band === "challenge" ? "indigo" : "azul",
      },
    };

    const bundleHtml = renderActivityHtml();
    const bundleRef = createUnguessableBundleRef("static");

    return {
      contract_version: ACTIVITY_ARTIFACT_CONTRACT_VERSION,
      manifest,
      bundle_ref: bundleRef,
      bundle_html: bundleHtml,
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
      evidence,
      parent_id: null,
      activity_set_id: input.activitySetId,
      status: "candidate",
    };
  });
}

export function createUnguessableBundleRef(namespace?: string): string {
  const path = namespace ? `${namespace}/${randomUUID()}` : randomUUID();
  return `artifact-bundles/${path}/index.html`;
}

function buildItemsForBand(
  band: DifficultyBand,
  context: SessionContext,
  match: CurriculumMatch,
  gamePlan: GamePlan,
) {
  const terms = context.vocabulary.length > 0 ? context.vocabulary : extractTerms(match.text);
  const boundedTerms = Array.from(
    new Set([...terms, "idea principal", "vocabulario", "evidencia", "conclusion"]),
  ).slice(0, 4);
  const bandTermCount = band === "support" ? 2 : band === "core" ? 3 : 4;

  if (gamePlan.family === "sequence_order") {
    const steps = [
      "Identificar la idea principal",
      "Reconocer vocabulario clave",
      "Relacionar una evidencia",
      "Explicar la conclusion",
    ].slice(0, bandTermCount);
    return [
      {
        prompt: `Ordena ${steps.length} pasos para explicar ${context.latest_topic} usando el objetivo ${match.objective_code}.`,
        answer_key: steps,
        hints: [
          "Empieza por reconocer de que trata el texto.",
          "La evidencia debe aparecer antes de la conclusion.",
        ],
      },
    ];
  }

  if (gamePlan.family === "match_classify") {
    return [
      {
        prompt: `Selecciona ${bandTermCount} conceptos que ayudan a explicar ${context.latest_topic}.`,
        answer_key: boundedTerms.slice(0, bandTermCount),
        hints: [
          "Empieza por la opcion que reconoces con mayor seguridad.",
          "Comprueba cada seleccion antes de completar.",
        ],
      },
    ];
  }

  return [
    {
      prompt: `Revisa las tarjetas y selecciona ${bandTermCount} ideas clave sobre ${context.latest_objective ?? context.latest_topic}.`,
      answer_key: boundedTerms.slice(0, bandTermCount),
      hints: [
        "Empieza por una tarjeta que puedas relacionar directamente con el objetivo.",
        "Quita las tarjetas que no ayuden a comprobar la idea principal.",
      ],
    },
  ];
}

function renderActivityHtml(): string {
  return `<!doctype html>
<html lang="es">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Actividad interactiva</title>
  <style>
    :root { color-scheme: light; font-family: system-ui, sans-serif; }
    body { margin: 0; background: linear-gradient(135deg, #eff6ff, #dbeafe); color: #0f172a; }
    main { max-width: 760px; margin: 0 auto; padding: clamp(16px, 4vw, 28px); }
    .card { background: rgba(255,255,255,.96); border: 2px solid #bfdbfe; border-radius: 24px; padding: clamp(18px, 4vw, 28px); box-shadow: 0 18px 40px rgba(30, 64, 175, 0.14); }
    h1 { color: #1d4ed8; font-size: clamp(1.45rem, 5vw, 1.9rem); margin: 0 0 8px; }
    .prompt { font-size: 1.15rem; line-height: 1.5; }
    .option { display: block; width: 100%; margin: 10px 0; padding: 12px 14px; border-radius: 12px; border: 1px solid #93c5fd; background: #eff6ff; text-align: left; font: inherit; cursor: pointer; touch-action: manipulation; }
    .option[aria-pressed="true"] { background: #bbf7d0; border-color: #22c55e; }
    .option:disabled { cursor: default; opacity: .7; }
    .actions { display: flex; gap: 10px; flex-wrap: wrap; margin-top: 18px; }
    .actions button { border: 0; border-radius: 999px; padding: 10px 16px; background: #2563eb; color: white; font-weight: 700; cursor: pointer; }
    .actions button:disabled { background: #64748b; cursor: default; }
    #feedback { min-height: 1.5rem; margin-top: 12px; font-weight: 700; }
    #order { min-height: 1.5rem; }
    .progress { height: 10px; border-radius: 999px; background: #dbeafe; overflow: hidden; margin: 16px 0; }
    .progress span { display:block; width: 0; height:100%; background:#2563eb; transition: width .2s ease; }
    :focus-visible { outline: 3px solid #f59e0b; outline-offset: 3px; }
    @media (prefers-reduced-motion: reduce) { * { animation: none !important; transition: none !important; } }
    @media (max-width: 520px) { .actions { flex-direction: column; } .actions button { width: 100%; } }
  </style>
</head>
<body>
  <main>
    <section class="card" aria-labelledby="activity-title">
      <p id="band-label">Cargando actividad...</p>
      <h1 id="activity-title">Actividad interactiva</h1>
      <div class="progress" aria-label="Progreso"><span></span></div>
      <p class="prompt" id="prompt" aria-live="polite">Espera mientras preparamos los materiales.</p>
      <div id="interaction" aria-busy="true"></div>
      <p id="order"></p>
      <div class="actions">
        <button id="hint" type="button" disabled>Pedir pista</button>
        <button id="complete" type="button" disabled>Completar</button>
      </div>
      <p id="feedback" role="status"></p>
    </section>
  </main>
  <script>
    const SDK_VERSION = "${ACTIVITY_SDK_VERSION}";
    const state = {
      manifest: null,
      band: null,
      answers: [],
      selected: new Set(),
      ordered: [],
      hintIndex: 0,
      completed: false,
      ready: false
    };

    function request(id, method) {
      window.parent.postMessage({ sdk: SDK_VERSION, type: "request", id, method }, "*");
    }

    function getManifest() { request("manifest", "getManifest"); }
    function getBand() { request("band", "getBand"); }
    function emit(method, payload) {
      window.parent.postMessage({ sdk: SDK_VERSION, type: "event", method, payload }, "*");
    }
    function reportAttempt(payload) { emit("reportAttempt", payload); }
    function reportHint(payload) { emit("reportHint", payload); }
    function reportComplete(payload) { emit("reportComplete", payload); }

    function rotated(values) {
      return values.length < 2 ? values.slice() : values.slice(1).concat(values[0]);
    }

    function choicesFor(manifest, answers) {
      if (manifest.family === "sequence_order") return rotated(answers);
      return rotated(answers.concat(["Tarjeta extra A", "Tarjeta extra B"]));
    }

    function currentAnswer() {
      return state.manifest.family === "sequence_order"
        ? state.ordered.slice()
        : Array.from(state.selected);
    }

    function computeScore() {
      if (state.manifest.family === "sequence_order") {
        return state.ordered.reduce(
          (score, answer, index) => score + (answer === state.answers[index] ? 1 : 0),
          0
        );
      }
      const correct = state.answers.filter((answer) => state.selected.has(answer)).length;
      const incorrect = Array.from(state.selected).filter((answer) => !state.answers.includes(answer)).length;
      return Math.max(0, correct - incorrect);
    }

    function reportCurrentAttempt() {
      const score = computeScore();
      const correct = score === state.answers.length;
      reportAttempt({ item_index: 0, correct, answer: currentAnswer() });
      document.querySelector(".progress span").style.width =
        String(Math.round((score / state.answers.length) * 100)) + "%";
      document.getElementById("feedback").textContent = correct
        ? "Muy bien: la organizacion es correcta."
        : "Buen intento. Ajusta las tarjetas o pide una pista.";
    }

    function updateOrder() {
      document.getElementById("order").textContent = state.ordered.length > 0
        ? "Tu orden: " + state.ordered.join(" -> ")
        : "Toca las tarjetas en el orden correcto.";
    }

    function choose(button, answer) {
      if (state.completed) return;
      const pressed = button.getAttribute("aria-pressed") === "true";
      button.setAttribute("aria-pressed", String(!pressed));
      if (state.manifest.family === "sequence_order") {
        const position = state.ordered.indexOf(answer);
        if (position >= 0) state.ordered.splice(position, 1);
        else state.ordered.push(answer);
        updateOrder();
      } else if (pressed) {
        state.selected.delete(answer);
      } else {
        state.selected.add(answer);
      }
      reportCurrentAttempt();
    }

    function makeOption(answer, index) {
      const button = document.createElement("button");
      button.className = "option";
      button.type = "button";
      button.setAttribute("aria-pressed", "false");
      button.textContent = String(index + 1) + ". " + answer;
      button.addEventListener("click", () => choose(button, answer));
      return button;
    }

    function render() {
      if (state.ready || !state.manifest || !state.band) return;
      const manifest = state.manifest;
      const item = manifest.content && manifest.content.items && manifest.content.items[0];
      if (!item || !Array.isArray(item.answer_key) || item.answer_key.length === 0) return;
      state.ready = true;
      state.answers = item.answer_key.slice();
      document.title = manifest.title;
      document.getElementById("activity-title").textContent = manifest.title;
      document.getElementById("band-label").textContent =
        "Actividad " + state.band + " - " + manifest.curriculum.objective;
      document.getElementById("prompt").textContent = item.prompt;
      const interaction = document.getElementById("interaction");
      choicesFor(manifest, state.answers).forEach((answer, index) => {
        interaction.appendChild(makeOption(answer, index));
      });
      interaction.setAttribute("aria-busy", "false");
      if (manifest.family === "sequence_order") updateOrder();
      document.getElementById("hint").disabled = false;
      document.getElementById("complete").disabled = false;
      document.getElementById("feedback").textContent =
        "Toca una tarjeta para empezar. Puedes cambiar tu eleccion.";
    }

    window.addEventListener("message", (event) => {
      if (event.source !== window.parent) return;
      const message = event.data;
      if (!message || message.sdk !== SDK_VERSION || message.type !== "response" || message.ok !== true) return;
      if (message.id === "manifest") state.manifest = message.result;
      if (message.id === "band") state.band = message.result;
      render();
    });

    document.getElementById("hint").addEventListener("click", () => {
      if (!state.ready || state.completed) return;
      const hints = state.manifest.content.items[0].hints;
      document.getElementById("feedback").textContent =
        hints[state.hintIndex] || "Ya usaste todas las pistas.";
      reportHint({ item_index: 0, hint_index: state.hintIndex });
      state.hintIndex += 1;
    });

    const completeButton = document.getElementById("complete");
    completeButton.addEventListener("click", () => {
      if (!state.ready || state.completed) return;
      state.completed = true;
      completeButton.disabled = true;
      document.getElementById("hint").disabled = true;
      document.querySelectorAll(".option").forEach((button) => { button.disabled = true; });
      reportComplete({
        score_unit: "count",
        score: computeScore(),
        total: state.answers.length,
        completed_at: new Date().toISOString()
      });
      document.getElementById("feedback").textContent = "Actividad completada. Gracias.";
    });

    getManifest();
    getBand();
  </script>
</body>
</html>`;
}



function buildSuccessCriteria(band: DifficultyBand): string[] {
  const base = ["Completa la interaccion principal", "Usa vocabulario o evidencia del objetivo"];
  return band === "challenge" ? [...base, "Explica o justifica tu decision"] : base;
}

function extractTerms(text: string): string[] {
  return text
    .split(/\s+/)
    .map((word) => word.replace(/[^\p{L}]/gu, ""))
    .filter((word) => word.length > 5)
    .slice(0, 4);
}

function shortTitle(topic: string): string {
  return topic.length > 44 ? `${topic.slice(0, 41)}...` : topic;
}

