import type { LessonState } from "@kobi/ai-core";
import type { CurriculumMatch } from "@kobi/curriculum";
import {
  ACTIVITY_ARTIFACT_CONTRACT_VERSION,
  ACTIVITY_SDK_VERSION,
  type ActivityArtifactCandidate,
  type ActivityFamily,
  type ActivityManifest,
  type DifficultyBand,
  type SessionContext,
} from "./types.js";
import { evidenceFromCurriculumMatches } from "./sessionContext.js";

export interface CreateActivityCandidatesInput {
  lessonState: LessonState;
  sessionContext: SessionContext;
  curriculumMatches: CurriculumMatch[];
}

const bandSpecs: Record<
  DifficultyBand,
  { family: ActivityFamily; estMinutes: number; titlePrefix: string }
> = {
  support: {
    family: "match_classify",
    estMinutes: 5,
    titlePrefix: "Apoyo",
  },
  core: {
    family: "guided_practice",
    estMinutes: 6,
    titlePrefix: "Practica",
  },
  challenge: {
    family: "sequence_order",
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

  return (["support", "core", "challenge"] as DifficultyBand[]).map((band) => {
    const spec = bandSpecs[band];
    const manifest: ActivityManifest = {
      family: spec.family,
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
        items: buildItemsForBand(band, input.sessionContext, primaryMatch),
        telemetry_events: ["attempt", "hint", "complete"],
      },
      entry: "index.html",
      sdk_version: ACTIVITY_SDK_VERSION,
      allowed_capabilities: band === "challenge" ? ["dom", "css", "svg"] : ["dom", "css"],
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
      status: "candidate",
    };
  });
}

function buildItemsForBand(
  band: DifficultyBand,
  context: SessionContext,
  match: CurriculumMatch,
) {
  const terms = context.vocabulary.length > 0 ? context.vocabulary : extractTerms(match.text);
  const boundedTerms = terms.length > 0 ? terms.slice(0, 4) : ["idea principal", "vocabulario", "evidencia"];

  if (band === "support") {
    return [
      {
        prompt: `Clasifica estas palabras del tema "${context.latest_topic}" como ideas clave de la clase.`,
        answer_key: boundedTerms,
        hints: [
          "Busca palabras que la docente repitio o explico con ejemplos.",
          "Relaciona cada palabra con el objetivo de la unidad.",
        ],
      },
    ];
  }

  if (band === "challenge") {
    return [
      {
        prompt: `Ordena los pasos para explicar el objetivo ${match.objective_code} a otro estudiante.`,
        answer_key: [
          "Identificar la idea principal",
          "Reconocer vocabulario clave",
          "Justificar con evidencia del texto",
        ],
        hints: [
          "Primero ubica de que trata el texto.",
          "La justificacion debe aparecer despues de reconocer las pistas.",
        ],
      },
    ];
  }

  return [
    {
      prompt: `Responde usando el objetivo ${match.objective_code}: ${context.latest_objective ?? context.latest_topic}.`,
      answer_key: boundedTerms.slice(0, 3),
      hints: [
        "Vuelve al vocabulario clave antes de responder.",
        "Tu respuesta debe conectarse con una evidencia del texto.",
      ],
    },
  ];
}

function renderActivityHtml(manifest: ActivityManifest): string {
  const item = manifest.content.items[0];
  const answers = item.answer_key;
  const buttons = answers
    .map(
      (answer, index) =>
        `<button class="option" data-answer="${escapeHtml(answer)}">${index + 1}. ${escapeHtml(answer)}</button>`,
    )
    .join("\n");
  const manifestJson = JSON.stringify(manifest).replace(/</g, "\\u003c");

  return `<!doctype html>
<html lang="es">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${escapeHtml(manifest.title)}</title>
  <style>
    :root { color-scheme: light; font-family: system-ui, sans-serif; }
    body { margin: 0; background: #fff7ed; color: #1f2937; }
    main { max-width: 720px; margin: 0 auto; padding: 24px; }
    .card { background: white; border: 2px solid #fed7aa; border-radius: 18px; padding: 24px; box-shadow: 0 12px 30px rgba(15, 23, 42, 0.08); }
    h1 { color: #9a3412; font-size: 1.7rem; margin: 0 0 8px; }
    .prompt { font-size: 1.15rem; line-height: 1.5; }
    .option { display: block; width: 100%; margin: 10px 0; padding: 12px 14px; border-radius: 12px; border: 1px solid #fdba74; background: #ffedd5; text-align: left; font: inherit; cursor: pointer; }
    .option[aria-pressed="true"] { background: #bbf7d0; border-color: #22c55e; }
    .actions { display: flex; gap: 10px; flex-wrap: wrap; margin-top: 18px; }
    .actions button { border: 0; border-radius: 999px; padding: 10px 16px; background: #ea580c; color: white; font-weight: 700; cursor: pointer; }
    #feedback { min-height: 1.5rem; margin-top: 12px; font-weight: 700; }
  </style>
</head>
<body>
  <main>
    <section class="card" aria-labelledby="activity-title">
      <p>Actividad ${escapeHtml(manifest.difficulty_band)} - ${escapeHtml(manifest.curriculum.objective)}</p>
      <h1 id="activity-title">${escapeHtml(manifest.title)}</h1>
      <p class="prompt">${escapeHtml(item.prompt)}</p>
      <div id="options">${buttons}</div>
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
    const assignmentId = "preview-assignment";
    let selected = new Set();
    let hintIndex = 0;

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

    getManifest();
    getBand();

    document.querySelectorAll(".option").forEach((button) => {
      button.addEventListener("click", () => {
        const answer = button.dataset.answer;
        const pressed = button.getAttribute("aria-pressed") === "true";
        button.setAttribute("aria-pressed", String(!pressed));
        if (pressed) selected.delete(answer); else selected.add(answer);
        const correct = selected.size > 0;
        reportAttempt({ assignment_id: assignmentId, item_index: 0, correct, answer: Array.from(selected) });
        document.getElementById("feedback").textContent = correct ? "Respuesta registrada." : "Elige una respuesta.";
      });
    });

    document.getElementById("hint").addEventListener("click", () => {
      const hints = manifest.content.items[0].hints;
      document.getElementById("feedback").textContent = hints[hintIndex] || "Ya usaste todas las pistas.";
      reportHint({ assignment_id: assignmentId, item_index: 0, hint_index: hintIndex });
      hintIndex += 1;
    });

    document.getElementById("complete").addEventListener("click", () => {
      reportComplete({ assignment_id: assignmentId, score: selected.size, total: manifest.content.items[0].answer_key.length, completed_at: new Date().toISOString() });
      document.getElementById("feedback").textContent = "Actividad completada. Gracias.";
    });
  </script>
</body>
</html>`;
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
