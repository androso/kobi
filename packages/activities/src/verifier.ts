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
  { pattern: /\btop\.location\b/i, reason: "top-level navigation is forbidden" },
  { pattern: /\bwindow\.top\b/i, reason: "top-window access is forbidden" },
  { pattern: /\bparent\.location\b/i, reason: "parent navigation is forbidden" },
  { pattern: /\bdocument\.write\s*\(/i, reason: "document.write is forbidden" },
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

const urlAttributes = new Set(["action", "data", "formaction", "href", "poster", "src", "srcset"]);

interface HtmlNode {
  nodeName: string;
  tagName?: string;
  attrs?: Array<{ name: string; value: string }>;
  content?: HtmlNode;
  childNodes?: HtmlNode[];
  value?: string;
}

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
    ...checkHtmlStructure(bundleHtml),
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
      if (name === "target" && ["_top", "_parent", "_blank"].includes(value)) {
        errors.push("navigation targets are forbidden");
      }
      if (urlAttributes.has(name) && isUnsafeUrl(value, name)) {
        errors.push("external or executable URL references are forbidden");
      }
      if (name === "http-equiv" && value === "refresh") {
        errors.push("meta refresh is forbidden");
      }
      if (name === "style" && /(?:@import|url\s*\()/i.test(attribute.value)) {
        errors.push("CSS URL references are forbidden");
      }
    }

    if (inspectScriptMarkup && tagName === "script") {
      errors.push(...checkScriptMarkup(node));
    }
  });

  return errors;
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

function isUnsafeUrl(value: string, attributeName?: string): boolean {
  if (attributeName === "srcset") {
    return extractSrcsetUrls(value).some((url) => isUnsafeUrl(url));
  }

  if (value === "" || value.startsWith("#") || value.startsWith("data:")) return false;
  return true;
}

function extractSrcsetUrls(value: string): string[] {
  const urls: string[] = [];
  let index = 0;

  while (index < value.length) {
    while (index < value.length && (value[index] === "," || /\s/.test(value[index]))) index += 1;
    if (index >= value.length) break;

    const start = index;
    const isDataUrl = /^data:/i.test(value.slice(start));
    while (
      index < value.length &&
      (isDataUrl ? !/\s/.test(value[index]) : !/[\s,]/.test(value[index]))
    ) {
      index += 1;
    }
    urls.push(value.slice(start, index));

    while (index < value.length && value[index] !== ",") index += 1;
    if (index < value.length) index += 1;
  }

  return urls;
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
