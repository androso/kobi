import {
  ACTIVITY_ARTIFACT_CONTRACT_VERSION,
  ACTIVITY_SDK_VERSION,
  activityArtifactCandidateSchema,
  activitySdkMessageSchema,
  type ActivityArtifact,
  type ActivityArtifactCandidate,
  type ActivityRubricScores,
  type ActivityVerifierScores,
} from "./types.js";

export interface VerifyActivityArtifactResult {
  ok: boolean;
  artifact: ActivityArtifact;
  errors: string[];
}

const forbiddenPatterns: Array<{ pattern: RegExp; reason: string }> = [
  { pattern: /<script\b[^>]*\bsrc\s*=/i, reason: "external script sources are forbidden" },
  { pattern: /<link\b[^>]*\bhref\s*=/i, reason: "external link assets are forbidden" },
  { pattern: /<img\b[^>]*\bsrc\s*=\s*["']?https?:/i, reason: "external image assets are forbidden" },
  { pattern: /\bfetch\s*\(/i, reason: "network fetch is forbidden" },
  { pattern: /\bXMLHttpRequest\b/i, reason: "XMLHttpRequest is forbidden" },
  { pattern: /\bWebSocket\b/i, reason: "WebSocket is forbidden" },
  { pattern: /\bEventSource\b/i, reason: "EventSource is forbidden" },
  { pattern: /\bnavigator\.sendBeacon\b/i, reason: "sendBeacon is forbidden" },
  { pattern: /\bimport\s*\(/i, reason: "dynamic imports are forbidden" },
  { pattern: /\bfrom\s+["'][^"']+["']/i, reason: "module imports are forbidden" },
  { pattern: /\blocalStorage\b/i, reason: "localStorage is forbidden" },
  { pattern: /\bsessionStorage\b/i, reason: "sessionStorage is forbidden" },
  { pattern: /\bindexedDB\b/i, reason: "indexedDB is forbidden" },
  { pattern: /\bdocument\.cookie\b/i, reason: "cookie access is forbidden" },
  { pattern: /\bwindow\.open\s*\(/i, reason: "popups are forbidden" },
  { pattern: /\btop\.location\b/i, reason: "top-level navigation is forbidden" },
  { pattern: /https?:\/\//i, reason: "absolute network URLs are forbidden" },
];

const minimumRubricScores: ActivityRubricScores = {
  curriculum_alignment: 0.8,
  age_fit: 0.8,
  duration_fit: 0.8,
  answer_correctness: 0.8,
  hint_leakage: 0.8,
  duplicate_risk: 0.8,
  spanish_suitability: 0.8,
};

export function verifyActivityArtifact(
  candidate: ActivityArtifactCandidate,
): VerifyActivityArtifactResult {
  const parsed = activityArtifactCandidateSchema.safeParse(candidate);
  const schemaErrors = parsed.success
    ? []
    : parsed.error.issues.map((issue) => `schema: ${issue.path.join(".")}: ${issue.message}`);

  const bundleHtml = candidate.bundle_html ?? "";
  const staticErrors = [
    ...checkHtmlShape(bundleHtml),
    ...checkForbiddenApis(bundleHtml),
    ...checkSdkTelemetry(bundleHtml),
    ...checkManifestCodeConsistency(candidate),
  ];
  const deterministicErrors = [...schemaErrors, ...staticErrors];
  const deterministic = deterministicErrors.length === 0 ? "pass" : "fail";
  const rubric = scoreRubric(candidate);
  const rubricErrors = checkRubricThresholds(rubric);
  const errors = [...deterministicErrors, ...rubricErrors];

  const verifier_scores: ActivityVerifierScores = {
    deterministic,
    rubric,
    ...(errors.length > 0 ? { errors } : {}),
  };

  const artifact: ActivityArtifact = {
    contract_version: ACTIVITY_ARTIFACT_CONTRACT_VERSION,
    manifest: candidate.manifest,
    bundle_ref: candidate.bundle_ref,
    verifier_scores,
    evidence: candidate.evidence,
    parent_id: candidate.parent_id ?? null,
    status: errors.length === 0 ? "verified" : "rejected",
  };

  return {
    ok: errors.length === 0,
    artifact,
    errors,
  };
}

export function validateActivitySdkMessage(message: unknown) {
  return activitySdkMessageSchema.safeParse(message);
}

function checkHtmlShape(bundleHtml: string): string[] {
  const errors: string[] = [];
  if (!/<!doctype html>/i.test(bundleHtml)) errors.push("bundle must declare <!doctype html>");
  if (!/<html\b/i.test(bundleHtml)) errors.push("bundle must include an <html> root");
  if (!/<script\b/i.test(bundleHtml)) errors.push("bundle must include inline JavaScript");
  if (/<iframe\b/i.test(bundleHtml)) errors.push("nested iframes are forbidden");
  return errors;
}

function checkForbiddenApis(bundleHtml: string): string[] {
  return forbiddenPatterns
    .filter(({ pattern }) => pattern.test(bundleHtml))
    .map(({ reason }) => reason);
}

function checkSdkTelemetry(bundleHtml: string): string[] {
  const requiredStrings = [
    ACTIVITY_SDK_VERSION,
    "postMessage",
    "getManifest",
    "getBand",
    "reportAttempt",
    "reportHint",
    "reportComplete",
  ];

  return requiredStrings
    .filter((required) => !bundleHtml.includes(required))
    .map((required) => `bundle is missing SDK hook: ${required}`);
}

function checkManifestCodeConsistency(candidate: ActivityArtifactCandidate): string[] {
  const errors: string[] = [];
  const html = candidate.bundle_html.toLocaleLowerCase("es-SV");
  const title = candidate.manifest.title.toLocaleLowerCase("es-SV");
  const prompts = candidate.manifest.content.items.map((item) =>
    item.prompt.toLocaleLowerCase("es-SV"),
  );

  if (!html.includes(title)) {
    errors.push("bundle does not render the manifest title");
  }

  if (
    !prompts.some((prompt) => {
      const prefix = prompt.slice(0, Math.min(prompt.length, 40));
      return html.includes(prefix) || html.includes(escapeHtml(prefix).toLocaleLowerCase("es-SV"));
    })
  ) {
    errors.push("bundle does not render any manifest item prompt");
  }

  return errors;
}

function scoreRubric(candidate: ActivityArtifactCandidate): ActivityRubricScores {
  const objective = candidate.manifest.curriculum.objective;
  const evidenceObjectives = new Set(candidate.evidence.map((evidence) => evidence.objective_code));
  const allAnswers = candidate.manifest.content.items.flatMap((item) => item.answer_key);
  const allHints = candidate.manifest.content.items.flatMap((item) => item.hints);

  return {
    curriculum_alignment: evidenceObjectives.has(objective) ? 0.95 : 0.72,
    age_fit: candidate.manifest.curriculum.grade === 7 ? 0.92 : 0.78,
    duration_fit: candidate.manifest.est_minutes >= 4 && candidate.manifest.est_minutes <= 8 ? 0.9 : 0.7,
    answer_correctness: allAnswers.length > 0 ? 0.9 : 0,
    hint_leakage: hintsLeakAnswers(allHints, allAnswers) ? 0.35 : 0.9,
    duplicate_risk: 0.86,
    spanish_suitability: looksSpanish(candidate.bundle_html) ? 0.9 : 0.62,
  };
}

function checkRubricThresholds(scores: ActivityRubricScores): string[] {
  return (Object.keys(minimumRubricScores) as Array<keyof ActivityRubricScores>).flatMap(
    (scoreName) => {
      const score = scores[scoreName];
      const minimum = minimumRubricScores[scoreName];
      return score >= minimum
        ? []
        : [`rubric: ${scoreName} ${score.toFixed(2)} is below ${minimum.toFixed(2)}`];
    },
  );
}

function hintsLeakAnswers(hints: string[], answers: string[]): boolean {
  const normalizedAnswers = answers.map(normalize).filter((answer) => answer.length > 3);
  return hints.some((hint) => {
    const normalizedHint = normalize(hint);
    return normalizedAnswers.some((answer) => normalizedHint.includes(answer));
  });
}

function looksSpanish(text: string): boolean {
  const normalized = normalize(text);
  const markers = [" el ", " la ", " de ", " que ", " una ", "respuesta", "actividad", "pista"];
  return markers.some((marker) => normalized.includes(marker));
}

function normalize(value: string): string {
  return ` ${value.toLocaleLowerCase("es-SV").normalize("NFD").replace(/[\u0300-\u036f]/g, "")} `;
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}
