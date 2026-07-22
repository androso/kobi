import {
  ACTIVITY_ARTIFACT_CONTRACT_VERSION,
  ACTIVITY_SDK_VERSION,
  activityArtifactCandidateSchema,
  type ActivityArtifact,
  type ActivityArtifactCandidate,
  type ActivityRubricScores,
  type ActivityVerifierScores,
} from "./types.js";
import { parse, parseFragment, type ParserError } from "parse5";

export interface VerifyActivityArtifactResult {
  ok: boolean;
  artifact: ActivityArtifact;
  errors: string[];
}

const forbiddenPatterns: Array<{ pattern: RegExp; reason: string }> = [
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
  {
    pattern: /(?:\.\s*location\b|\[\s*["']location["']\s*\])/i,
    reason: "self-navigation is forbidden",
  },
  {
    pattern: /(^|[^\w$.])location\s*(?:\.|\[|=)/i,
    reason: "self-navigation is forbidden",
  },
  { pattern: /\btop\.location\b/i, reason: "top-level navigation is forbidden" },
  { pattern: /\bwindow\.top\b/i, reason: "top-window access is forbidden" },
  { pattern: /\bparent\.location\b/i, reason: "parent navigation is forbidden" },
  {
    pattern: /\bdocument\s*(?:\.\s*write(?:ln)?|\[\s*["']write(?:ln)?["']\s*\])\s*\(/i,
    reason: "document.write is forbidden",
  },
  { pattern: /\beval\s*\(/i, reason: "eval is forbidden" },
  { pattern: /\bnew\s+Function\s*\(/i, reason: "Function constructor is forbidden" },
  { pattern: /https?:\/\//i, reason: "absolute network URLs are forbidden" },
];

const forbiddenElements = new Map([
  ["base", "base URL declarations are forbidden"],
  ["embed", "embedded content is forbidden"],
  ["form", "forms are forbidden"],
  ["frame", "nested browsing contexts are forbidden"],
  ["frameset", "nested browsing contexts are forbidden"],
  ["iframe", "nested browsing contexts are forbidden"],
  ["link", "external link assets are forbidden"],
  ["object", "embedded content is forbidden"],
]);

const urlAttributes = new Set([
  "action",
  "data",
  "formaction",
  "href",
  "poster",
  "src",
  "srcset",
  "xlink:href",
]);
const svgUrlPresentationAttributes = new Set([
  "clip-path",
  "fill",
  "filter",
  "marker",
  "marker-end",
  "marker-mid",
  "marker-start",
  "mask",
  "stroke",
]);

interface HtmlNode {
  nodeName: string;
  tagName?: string;
  attrs?: Array<{ name: string; value: string }>;
  content?: HtmlNode;
  childNodes?: HtmlNode[];
  value?: string;
}

const minimumRubricScores: ActivityRubricScores = {
  curriculum_alignment: 0.7,
  age_fit: 0.8,
  duration_fit: 0.65,
  answer_correctness: 0.8,
  hint_leakage: 0.8,
  duplicate_risk: 0.8,
  spanish_suitability: 0.6,
  gamefulness: 0.75,
  interaction_quality: 0.6,
  visual_coherence: 0.6,
  accessibility: 0.75,
  band_coherence: 0.75,
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
    ...checkHtmlStructure(bundleHtml),
    ...checkNewManifestFields(candidate),
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
    activity_set_id: candidate.activity_set_id ?? null,
    status: errors.length === 0 ? "verified" : "rejected",
  };

  return {
    ok: errors.length === 0,
    artifact,
    errors,
  };
}

function checkHtmlShape(bundleHtml: string): string[] {
  const errors: string[] = [];
  if (!/<!doctype html>/i.test(bundleHtml)) errors.push("bundle must declare <!doctype html>");
  if (!/<html\b/i.test(bundleHtml)) errors.push("bundle must include an <html> root");
  if (!/<script\b/i.test(bundleHtml)) errors.push("bundle must include inline JavaScript");
  return errors;
}

function checkHtmlStructure(bundleHtml: string): string[] {
  const errors: string[] = [];
  const parseErrors: ParserError[] = [];
  const document = parse(bundleHtml, { onParseError: (error) => parseErrors.push(error) }) as HtmlNode;

  if (parseErrors.some((error) => error.code !== "missing-doctype")) {
    errors.push("bundle must be well-formed HTML");
  }

  errors.push(...inspectHtmlNodeTree(document, true));

  return [...new Set(errors)];
}

function inspectHtmlNodeTree(root: HtmlNode, inspectScriptMarkup: boolean): string[] {
  const errors: string[] = [];

  visit(root, (node) => {
    const tagName = node.tagName?.toLowerCase();
    if (!tagName) return;

    const forbiddenReason = forbiddenElements.get(tagName);
    if (forbiddenReason) errors.push(forbiddenReason);

    for (const attribute of node.attrs ?? []) {
      const name = attribute.name.toLowerCase();
      const value = attribute.value.trim().toLowerCase();
      if (name.startsWith("on")) errors.push("inline event handlers are forbidden");
      if (name === "sandbox") errors.push("artifact-controlled sandbox attributes are forbidden");
      if (name === "target" && value !== "_self") {
        errors.push("navigation targets are forbidden");
      }
      if (urlAttributes.has(name) && isUnsafeUrl(value, name, tagName)) {
        errors.push("external or executable URL references are forbidden");
      }
      if (name === "http-equiv" && value === "refresh") {
        errors.push("meta refresh is forbidden");
      }
      if (
        tagName === "meta" &&
        name === "http-equiv" &&
        ["content-security-policy", "content-security-policy-report-only"].includes(value)
      ) {
        errors.push("artifact-controlled CSP meta tags are forbidden");
      }
      if (name === "style" && /(?:@import|url\s*\()/i.test(attribute.value)) {
        errors.push("CSS URL references are forbidden");
      }
      if (svgUrlPresentationAttributes.has(name) && isUnsafeSvgPresentationUrl(attribute.value)) {
        errors.push("SVG URL references are forbidden");
      }
    }

    if (tagName === "style" && /(?:@import|url\s*\()/i.test(textContent(node))) {
      errors.push("CSS URL references are forbidden");
    }

    if (inspectScriptMarkup && tagName === "script") {
      errors.push(...checkScriptMarkup(node));
    }
  });

  return errors;
}

function isUnsafeSvgPresentationUrl(value: string): boolean {
  if (!/url\s*\(/i.test(value)) return false;
  return !/^url\s*\(\s*(["']?)#[A-Za-z_][\w:.-]*\1\s*\)$/i.test(value.trim());
}

function checkScriptMarkup(scriptNode: HtmlNode): string[] {
  const errors: string[] = [];
  for (const literal of extractScriptStringLiterals(textContent(scriptNode))) {
    errors.push(...inspectHtmlNodeTree(parseFragment(literal) as HtmlNode, false));
  }
  return errors;
}

function extractScriptStringLiterals(scriptText: string): string[] {
  const stringLiteralPattern = /(["'`])(?:\\[\s\S]|(?!\1)[\s\S])*\1/g;
  return (scriptText.match(stringLiteralPattern) ?? []).map((literal) => literal.slice(1, -1));
}

function textContent(node: HtmlNode): string {
  if (node.nodeName === "#text") return node.value ?? "";
  return [
    ...(node.childNodes ?? []).map(textContent),
    ...(node.content ? [textContent(node.content)] : []),
  ].join("");
}

function visit(node: HtmlNode, callback: (node: HtmlNode) => void): void {
  callback(node);
  if (node.content) visit(node.content, callback);
  for (const child of node.childNodes ?? []) visit(child, callback);
}

function isUnsafeUrl(
  value: string,
  attributeName?: string,
  tagName?: string,
): boolean {
  if (attributeName === "srcset") {
    return tagName !== "img" || !isSafeDataImageSrcset(value);
  }

  if (value === "") return true;
  if (value.startsWith("#")) return !["href", "xlink:href"].includes(attributeName ?? "");
  if (value.startsWith("data:")) {
    return !(
      tagName === "img" &&
      (attributeName === "src" || attributeName === "srcset") &&
      /^data:image\//i.test(value)
    );
  }
  return true;
}

function isSafeDataImageSrcset(value: string): boolean {
  let remaining = value.trim();
  const candidatePattern = /^data:image\/[a-z0-9.+-]+(?:;[a-z0-9.+-]+(?:=[^,;\s]+)?)*,[^,\s]+(?:\s+(?:\d+(?:\.\d+)?x|\d+w))?/i;

  while (remaining.length > 0) {
    const candidate = remaining.match(candidatePattern)?.[0];
    if (!candidate) return false;

    remaining = remaining.slice(candidate.length).trimStart();
    if (remaining.length === 0) return true;
    if (!remaining.startsWith(",")) return false;
    remaining = remaining.slice(1).trimStart();
  }

  return false;
}

function checkNewManifestFields(candidate: ActivityArtifactCandidate): string[] {
  const manifest = candidate.manifest;
  const errors: string[] = [];
  if (!manifest.mechanic) errors.push("manifest.mechanic is required for new artifacts");
  if (!manifest.learning_design?.learning_goal) errors.push("manifest.learning_design.learning_goal is required for new artifacts");
  if (!manifest.learning_design?.interaction_summary) errors.push("manifest.learning_design.interaction_summary is required for new artifacts");
  if (!manifest.learning_design?.success_criteria?.length) errors.push("manifest.learning_design.success_criteria is required for new artifacts");
  if (!manifest.visual_theme?.scene) errors.push("manifest.visual_theme.scene is required for new artifacts");
  if (!manifest.visual_theme?.accent) errors.push("manifest.visual_theme.accent is required for new artifacts");
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
    "score_unit",
  ];

  return requiredStrings
    .filter((required) => !bundleHtml.includes(required))
    .map((required) => `bundle is missing SDK hook: ${required}`);
}

function checkManifestCodeConsistency(candidate: ActivityArtifactCandidate): string[] {
  const editableFields = [
    { path: "manifest.title", value: candidate.manifest.title },
    ...candidate.manifest.content.items.flatMap((item, itemIndex) => [
      { path: `manifest.content.items[${itemIndex}].prompt`, value: item.prompt },
      ...item.answer_key.map((value, answerIndex) => ({
        path: `manifest.content.items[${itemIndex}].answer_key[${answerIndex}]`,
        value,
      })),
      ...item.hints.map((value, hintIndex) => ({
        path: `manifest.content.items[${itemIndex}].hints[${hintIndex}]`,
        value,
      })),
    ]),
  ];
  const html = candidate.bundle_html.toLocaleLowerCase("es-SV");
  const errors: string[] = [];

  for (const field of editableFields) {
    const variants = [
      field.value,
      escapeHtml(field.value),
      JSON.stringify(field.value).slice(1, -1),
    ].map((value) => value.toLocaleLowerCase("es-SV"));
    if (variants.some((value) => value.length > 0 && html.includes(value))) {
      errors.push(`bundle embeds editable runtime content from ${field.path}`);
    }
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
    age_fit: candidate.manifest.curriculum.grade >= 1 && candidate.manifest.curriculum.grade <= 12 ? 0.92 : 0.5,
    duration_fit: candidate.manifest.est_minutes >= 4 && candidate.manifest.est_minutes <= 8 ? 0.9 : 0.7,
    answer_correctness: allAnswers.length > 0 ? 0.9 : 0,
    hint_leakage: hintsLeakAnswers(allHints, allAnswers) ? 0.35 : 0.9,
    duplicate_risk: 0.86,
    spanish_suitability: looksSpanish(candidate.bundle_html) ? 0.9 : 0.62,
    gamefulness: candidate.manifest.mechanic ? 0.88 : 0.5,
    interaction_quality: /addEventListener|onclick|drag|key/i.test(candidate.bundle_html) ? 0.86 : 0.55,
    visual_coherence: /#2563eb|#1d4ed8|azul|blue/i.test(candidate.bundle_html) ? 0.86 : 0.62,
    accessibility: /:focus-visible|aria-|prefers-reduced-motion/i.test(candidate.bundle_html) ? 0.84 : 0.55,
    band_coherence: candidate.activity_set_id ? 0.9 : 0.76,
  };
}

function checkRubricThresholds(scores: ActivityRubricScores): string[] {
  return (Object.keys(minimumRubricScores) as Array<keyof ActivityRubricScores>).flatMap(
    (scoreName) => {
      const score = scores[scoreName];
      const minimum = minimumRubricScores[scoreName] ?? 0;
      return typeof score === "number" && score >= minimum
        ? []
        : [`rubric: ${scoreName} ${(score ?? 0).toFixed(2)} is below ${minimum.toFixed(2)}`];
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
