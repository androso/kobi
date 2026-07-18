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

    const bundleHtml = renderActivityHtml(manifest);
    const bundleRef = `artifact-bundles/${stableHash(
      `${band}:${manifest.title}:${manifest.curriculum.objective}:${bundleHtml}`,
    )}/index.html`;

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
      prompt: `Escribe una respuesta sobre ${context.latest_objective ?? context.latest_topic} usando ${bandTermCount} ideas clave.`,
      answer_key: boundedTerms.slice(0, bandTermCount),
      hints: [
        "Escribe una oracion completa.",
        "Revisa que tu explicacion tenga inicio y cierre.",
      ],
    },
  ];
}

function renderActivityHtml(manifest: ActivityManifest): string {
  const item = manifest.content.items[0];
  const interactionHtml = renderInteraction(manifest);
  const manifestJson = JSON.stringify(manifest).replace(/</g, "\\u003c");

  return `<!doctype html>
<html lang="es">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <meta http-equiv="Content-Security-Policy" content="default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; img-src data:; connect-src 'none'; base-uri 'none'; form-action 'none'">
  <title>${escapeHtml(manifest.title)}</title>
  <style>
    :root { color-scheme: light; font-family: system-ui, sans-serif; }
    body { margin: 0; background: linear-gradient(135deg, #eff6ff, #dbeafe); color: #0f172a; }
    main { max-width: 760px; margin: 0 auto; padding: clamp(16px, 4vw, 28px); }
    .card { background: rgba(255,255,255,.96); border: 2px solid #bfdbfe; border-radius: 24px; padding: clamp(18px, 4vw, 28px); box-shadow: 0 18px 40px rgba(30, 64, 175, 0.14); }
    h1 { color: #1d4ed8; font-size: clamp(1.45rem, 5vw, 1.9rem); margin: 0 0 8px; }
    .prompt { font-size: 1.15rem; line-height: 1.5; }
    .option { display: block; width: 100%; margin: 10px 0; padding: 12px 14px; border-radius: 12px; border: 1px solid #93c5fd; background: #eff6ff; text-align: left; font: inherit; cursor: pointer; }
    .option[aria-pressed="true"] { background: #bbf7d0; border-color: #22c55e; }
    .actions { display: flex; gap: 10px; flex-wrap: wrap; margin-top: 18px; }
    .actions button { border: 0; border-radius: 999px; padding: 10px 16px; background: #2563eb; color: white; font-weight: 700; cursor: pointer; }
    #feedback { min-height: 1.5rem; margin-top: 12px; font-weight: 700; }
    .progress { height: 10px; border-radius: 999px; background: #dbeafe; overflow: hidden; margin: 16px 0; }
    .progress span { display:block; width: 0; height:100%; background:#2563eb; transition: width .2s ease; }
    textarea { box-sizing: border-box; width: 100%; min-height: 130px; border: 2px solid #93c5fd; border-radius: 14px; padding: 12px; font: inherit; }
    :focus-visible { outline: 3px solid #f59e0b; outline-offset: 3px; }
    @media (prefers-reduced-motion: reduce) { * { animation: none !important; transition: none !important; } }
    @media (max-width: 520px) { .actions { flex-direction: column; } .actions button { width: 100%; } }
  </style>
</head>
<body>
  <main>
    <section class="card" aria-labelledby="activity-title">
      <p>Actividad ${escapeHtml(manifest.difficulty_band)} - ${escapeHtml(manifest.curriculum.objective)}</p>
      <h1 id="activity-title">${escapeHtml(manifest.title)}</h1>
      <div class="progress" aria-label="Progreso"><span></span></div>
      <p class="prompt">${escapeHtml(item.prompt)}</p>
      <div id="interaction">${interactionHtml}</div>
      <div class="actions">
        <button id="hint" type="button">Pedir pista</button>
        <button id="complete" type="button">Completar</button>
      </div>
      <p id="feedback" role="status"></p>
    </section>
  </main>
  <script>
    const SDK_VERSION = "${ACTIVITY_SDK_VERSION}";
    const manifest = ${manifestJson};
    const interactionMode = manifest.family;
    const answers = manifest.content.items[0].answer_key;
    let selected = new Set();
    let ordered = [];
    let responseText = "";
    let justificationText = "";
    let hintIndex = 0;
    let completed = false;
    const requiresJustification = manifest.difficulty_band === "challenge" && interactionMode !== "guided_practice";

    function emit(method, payload) {
      window.parent.postMessage({ sdk: SDK_VERSION, type: "event", method, payload }, "*");
    }

    function getManifest() {
      window.parent.postMessage({ sdk: SDK_VERSION, type: "request", id: "manifest", method: "getManifest" }, "*");
      return manifest;
    }

    function getBand() {
      window.parent.postMessage({ sdk: SDK_VERSION, type: "request", id: "band", method: "getBand" }, "*");
      return manifest.difficulty_band;
    }

    function reportAttempt(payload) { emit("reportAttempt", payload); }
    function reportHint(payload) { emit("reportHint", payload); }
    function reportComplete(payload) { emit("reportComplete", payload); }

    function normalizeAnswer(value) {
      return String(value).toLocaleLowerCase("es-SV").normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim();
    }

    function computeScore() {
      if (interactionMode === "sequence_order") {
        return ordered.reduce((score, answer, index) => score + (answer === answers[index] ? 1 : 0), 0);
      }
      if (interactionMode === "guided_practice") {
        const normalizedResponse = normalizeAnswer(responseText);
        return answers.filter((answer) => normalizedResponse.includes(normalizeAnswer(answer))).length;
      }

      const correctSelections = answers.filter((answer) => selected.has(answer)).length;
      const incorrectSelections = Array.from(selected).filter((answer) => !answers.includes(answer)).length;
      return Math.max(0, correctSelections - incorrectSelections);
    }

    function currentAnswer() {
      const answer = interactionMode === "sequence_order"
        ? ordered
        : interactionMode === "guided_practice"
          ? responseText
          : Array.from(selected);
      return requiresJustification ? { answer, justification: justificationText } : answer;
    }

    function reportCurrentAttempt() {
      const score = computeScore();
      const correct = score === answers.length && (!requiresJustification || justificationText.trim().length >= 8);
      reportAttempt({ item_index: 0, correct, answer: currentAnswer() });
      document.querySelector(".progress span").style.width = String(Math.round((score / answers.length) * 100)) + "%";
      document.getElementById("feedback").textContent = correct
        ? "Respuesta correcta."
        : "Sigue intentando o pide una pista.";
    }

    getManifest();
    getBand();

    document.querySelectorAll(".option").forEach((button) => {
      button.addEventListener("click", () => {
        const answer = button.dataset.answer;
        const pressed = button.getAttribute("aria-pressed") === "true";
        button.setAttribute("aria-pressed", String(!pressed));
        if (interactionMode === "sequence_order") {
          const position = ordered.indexOf(answer);
          if (position >= 0) ordered.splice(position, 1); else ordered.push(answer);
          document.getElementById("order").textContent = ordered.length > 0
            ? "Tu orden: " + ordered.join(" -> ")
            : "Selecciona las tarjetas en el orden correcto.";
        } else if (pressed) {
          selected.delete(answer);
        } else {
          selected.add(answer);
        }
        reportCurrentAttempt();
      });
    });

    const response = document.getElementById("response");
    if (response) {
      response.addEventListener("change", () => {
        responseText = response.value;
        reportCurrentAttempt();
      });
    }

    const justification = document.getElementById("justification");
    if (justification) {
      justification.addEventListener("change", () => {
        justificationText = justification.value;
        reportCurrentAttempt();
      });
    }

    document.getElementById("hint").addEventListener("click", () => {
      const hints = manifest.content.items[0].hints;
      document.getElementById("feedback").textContent = hints[hintIndex] || "Ya usaste todas las pistas.";
      reportHint({ item_index: 0, hint_index: hintIndex });
      hintIndex += 1;
    });

    const completeButton = document.getElementById("complete");
    completeButton.addEventListener("click", () => {
      if (completed) return;
      if (requiresJustification && justificationText.trim().length < 8) {
        document.getElementById("feedback").textContent = "Explica brevemente tu decision antes de completar.";
        return;
      }
      completed = true;
      completeButton.disabled = true;
      reportComplete({ score_unit: "count", score: computeScore(), total: answers.length, completed_at: new Date().toISOString() });
      document.getElementById("feedback").textContent = "Actividad completada. Gracias.";
    });
  </script>
</body>
</html>`;
}

function renderInteraction(manifest: ActivityManifest): string {
  const answers = manifest.content.items[0].answer_key;
  if (manifest.family === "guided_practice") {
    return '<label for="response">Tu respuesta</label><textarea id="response" placeholder="Escribe aqui y usa las ideas clave de la clase."></textarea>';
  }

  const justification = manifest.difficulty_band === "challenge"
    ? '<label for="justification">Explica tu decision</label><textarea id="justification" placeholder="Justifica brevemente usando evidencia del objetivo."></textarea>'
    : "";

  const choices = manifest.family === "sequence_order"
    ? rotateChoices(answers)
    : rotateChoices([...answers, "Detalle sin evidencia", "Concepto fuera del objetivo"]);
  const buttons = choices
    .map(
      (answer, index) =>
        `<button class="option" type="button" aria-pressed="false" data-answer="${escapeHtml(answer)}">${index + 1}. ${escapeHtml(answer)}</button>`,
    )
    .join("\n");

  return manifest.family === "sequence_order"
    ? `${buttons}<p id="order">Selecciona las tarjetas en el orden correcto.</p>${justification}`
    : `${buttons}${justification}`;
}

function rotateChoices(values: string[]): string[] {
  if (values.length < 2) return values;
  return [...values.slice(1), values[0]];
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

function stableHash(value: string): string {
  let hash = 0x811c9dc5;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }

  return (hash >>> 0).toString(16).padStart(8, "0");
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}
