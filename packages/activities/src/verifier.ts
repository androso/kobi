import {
  ACTIVITY_ARTIFACT_CONTRACT_VERSION,
  ACTIVITY_SDK_VERSION,
  activityArtifactCandidateSchema,
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
    ...checkCompletionTelemetry(bundleHtml),
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

function checkCompletionTelemetry(bundleHtml: string): string[] {
  const completionCalls = findExecutableCompletionCalls(bundleHtml);

  if (completionCalls.length === 0) {
    return ["bundle must call reportComplete with a telemetry payload"];
  }

  if (completionCalls.every((call) => call === "canonical")) return [];

  if (completionCalls.some((call) => call === "wrong")) {
    return ["bundle completion total must equal manifest.content.items.length"];
  }

  return ["bundle reportComplete payload must include total equal to manifest.content.items.length"];
}

type JavaScriptToken = {
  kind: "identifier" | "string" | "punctuation";
  value: string;
};

type CompletionCallCheck = "canonical" | "wrong" | "missing";

function findExecutableCompletionCalls(bundleHtml: string): CompletionCallCheck[] {
  const tokens = tokenizeJavaScript(bundleHtml);
  const calls: CompletionCallCheck[] = [];

  for (let index = 0; index < tokens.length - 1; index += 1) {
    if (tokens[index].value !== "reportComplete" || tokens[index + 1].value !== "(") continue;
    if (tokens[index - 1]?.value === "function") continue;

    const closingParen = findMatchingDelimiter(tokens, index + 1, "(", ")");
    if (closingParen === -1) {
      calls.push("missing");
      continue;
    }

    calls.push(checkCompletionCallPayload(tokens.slice(index + 2, closingParen)));
    index = closingParen;
  }

  return calls;
}

function checkCompletionCallPayload(payload: JavaScriptToken[]): CompletionCallCheck {
  if (payload[0]?.value !== "{" || payload.at(-1)?.value !== "}") return "missing";

  const totalExpressions = findTopLevelPropertyExpressions(payload, "total");
  if (totalExpressions.length === 0) return "missing";

  return totalExpressions.every(isCanonicalItemCountExpression) ? "canonical" : "wrong";
}

function findTopLevelPropertyExpressions(
  objectTokens: JavaScriptToken[],
  propertyName: string,
): JavaScriptToken[][] {
  const expressions: JavaScriptToken[][] = [];
  const lastIndex = objectTokens.length - 1;
  let index = 1;

  while (index < lastIndex) {
    if (isPropertyName(objectTokens[index], propertyName) && objectTokens[index + 1]?.value === ":") {
      const expressionStart = index + 2;
      const expressionEnd = findExpressionEnd(objectTokens, expressionStart, lastIndex);
      expressions.push(objectTokens.slice(expressionStart, expressionEnd));
      index = expressionEnd + (objectTokens[expressionEnd]?.value === "," ? 1 : 0);
      continue;
    }

    const closingDelimiter = matchingClosingDelimiter(objectTokens[index]?.value);
    if (closingDelimiter) {
      const closingIndex = findMatchingDelimiter(objectTokens, index, objectTokens[index].value, closingDelimiter);
      index = closingIndex === -1 ? lastIndex : closingIndex + 1;
      continue;
    }

    index += 1;
  }

  return expressions;
}

function findExpressionEnd(tokens: JavaScriptToken[], start: number, objectEnd: number): number {
  let braceDepth = 0;
  let bracketDepth = 0;
  let parenDepth = 0;

  for (let index = start; index < objectEnd; index += 1) {
    const value = tokens[index].value;
    if (value === "{") braceDepth += 1;
    else if (value === "}") {
      if (braceDepth === 0) return index;
      braceDepth -= 1;
    } else if (value === "[") bracketDepth += 1;
    else if (value === "]") bracketDepth -= 1;
    else if (value === "(") parenDepth += 1;
    else if (value === ")") parenDepth -= 1;
    else if (value === "," && braceDepth === 0 && bracketDepth === 0 && parenDepth === 0) {
      return index;
    }
  }

  return objectEnd;
}

function isPropertyName(token: JavaScriptToken | undefined, propertyName: string): boolean {
  if (!token) return false;
  if (token.kind === "identifier") return token.value === propertyName;
  if (token.kind !== "string") return false;

  const quote = token.value[0];
  return (quote === '"' || quote === "'") && token.value.slice(1, -1) === propertyName;
}

function isCanonicalItemCountExpression(expression: JavaScriptToken[]): boolean {
  return expression.map((token) => token.value).join("") === "manifest.content.items.length";
}

function tokenizeJavaScript(source: string): JavaScriptToken[] {
  const tokens: JavaScriptToken[] = [];

  for (let index = 0; index < source.length; ) {
    const character = source[index];
    if (/\s/.test(character)) {
      index += 1;
      continue;
    }

    if (character === "/" && source[index + 1] === "/") {
      index = skipLineComment(source, index + 2);
      continue;
    }
    if (character === "/" && source[index + 1] === "*") {
      index = skipBlockComment(source, index + 2);
      continue;
    }
    if (character === '"' || character === "'" || character === "`") {
      const end = skipStringLiteral(source, index, character);
      if (character !== "`") tokens.push({ kind: "string", value: source.slice(index, end) });
      index = end;
      continue;
    }
    if (/[A-Za-z_$]/.test(character)) {
      const start = index;
      index += 1;
      while (index < source.length && /[A-Za-z0-9_$]/.test(source[index])) index += 1;
      tokens.push({ kind: "identifier", value: source.slice(start, index) });
      continue;
    }

    tokens.push({ kind: "punctuation", value: character });
    index += 1;
  }

  return tokens;
}

function skipLineComment(source: string, index: number): number {
  while (index < source.length && source[index] !== "\n") index += 1;
  return index;
}

function skipBlockComment(source: string, index: number): number {
  const end = source.indexOf("*/", index);
  return end === -1 ? source.length : end + 2;
}

function skipStringLiteral(source: string, start: number, quote: string): number {
  let index = start + 1;
  while (index < source.length) {
    if (source[index] === "\\") {
      index += 2;
      continue;
    }
    if (source[index] === quote) return index + 1;
    index += 1;
  }
  return source.length;
}

function matchingClosingDelimiter(value: string | undefined): string | null {
  if (value === "{") return "}";
  if (value === "[") return "]";
  if (value === "(") return ")";
  return null;
}

function findMatchingDelimiter(
  tokens: JavaScriptToken[],
  start: number,
  opening: string,
  closing: string,
): number {
  let depth = 0;
  for (let index = start; index < tokens.length; index += 1) {
    if (tokens[index].value === opening) depth += 1;
    else if (tokens[index].value === closing) {
      depth -= 1;
      if (depth === 0) return index;
    }
  }
  return -1;
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
