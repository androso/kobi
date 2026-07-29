import type { LessonState } from "@kobi/ai-core";

export interface ContextReadinessThresholds {
  minSegments: number;
  minConfidence: number;
  minStableSegments: number;
  minKeyTerms: number;
}

export interface ContextReadinessDecision {
  eligible: boolean;
  reason:
    | "ready"
    | "not_enough_segments"
    | "low_confidence"
    | "unstable_topic"
    | "insufficient_grounding";
  segmentCount: number;
  confidentSegmentCount: number;
  stableTopicCount: number;
  keyTermCount: number;
}

export const DEFAULT_CONTEXT_READINESS_THRESHOLDS: ContextReadinessThresholds = {
  minSegments: 2,
  minConfidence: 0.65,
  minStableSegments: 2,
  minKeyTerms: 3,
};

/**
 * Cheap eligibility gate for waking the semantic checkpoint agent. This does
 * not approve generation; it only avoids paying for a checkpoint judgment on
 * a single noisy lesson-state snapshot.
 */
export function evaluateContextReadiness(
  lessonStates: LessonState[],
  thresholds: ContextReadinessThresholds = DEFAULT_CONTEXT_READINESS_THRESHOLDS,
): ContextReadinessDecision {
  const recent = lessonStates.slice(-Math.max(thresholds.minSegments, thresholds.minStableSegments));
  const segmentCount = recent.length;
  const confidentSegmentCount = recent.filter(
    (state) => state.confidence >= thresholds.minConfidence,
  ).length;
  const stableStates = recent.slice(-thresholds.minStableSegments);
  const stableTopics = stableStates
    .map((state) => normalizeTopic(state.topic))
    .filter(Boolean);
  const stableAnchors = stableStates.map((state) =>
    normalizeTopic(`${state.topic} ${state.objective_guess ?? ""}`),
  );
  const stableTopicCount =
    stableTopics.length === thresholds.minStableSegments
      && stableAnchors.every((anchor, index) =>
        index === 0 || anchorsAreRelated(stableAnchors[index - 1] ?? "", anchor),
      )
      ? stableTopics.length
      : 0;
  const latest = recent.at(-1);
  const keyTermCount = new Set(
    recent.flatMap((state) => state.key_terms.map((term) => term.trim().toLocaleLowerCase("es-SV"))),
  ).size;

  const metrics = {
    segmentCount,
    confidentSegmentCount,
    stableTopicCount,
    keyTermCount,
  };

  if (segmentCount < thresholds.minSegments) {
    return { eligible: false, reason: "not_enough_segments", ...metrics };
  }
  if (confidentSegmentCount < thresholds.minSegments) {
    return { eligible: false, reason: "low_confidence", ...metrics };
  }
  if (stableTopicCount < thresholds.minStableSegments) {
    return { eligible: false, reason: "unstable_topic", ...metrics };
  }
  if (!latest?.objective_guess?.trim() && keyTermCount < thresholds.minKeyTerms) {
    return { eligible: false, reason: "insufficient_grounding", ...metrics };
  }

  return { eligible: true, reason: "ready", ...metrics };
}

export function readContextReadinessThresholds(
  env: NodeJS.ProcessEnv = process.env,
): ContextReadinessThresholds {
  return {
    minSegments: readPositiveInteger(
      env.CHECKPOINT_MIN_SEGMENTS,
      DEFAULT_CONTEXT_READINESS_THRESHOLDS.minSegments,
    ),
    minConfidence: readUnitInterval(
      env.CHECKPOINT_MIN_CONFIDENCE,
      DEFAULT_CONTEXT_READINESS_THRESHOLDS.minConfidence,
    ),
    minStableSegments: readPositiveInteger(
      env.CHECKPOINT_MIN_STABLE_SEGMENTS,
      DEFAULT_CONTEXT_READINESS_THRESHOLDS.minStableSegments,
    ),
    minKeyTerms: readPositiveInteger(
      env.CHECKPOINT_MIN_KEY_TERMS,
      DEFAULT_CONTEXT_READINESS_THRESHOLDS.minKeyTerms,
    ),
  };
}

function normalizeTopic(topic: string): string {
  const normalized = topic
    .trim()
    .toLocaleLowerCase("es-SV")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim();
  if (!normalized || normalized === "tema de clase" || normalized === "sin tema") return "";
  return normalized;
}

function anchorsAreRelated(left: string, right: string): boolean {
  if (!left || !right) return false;
  if (left === right || left.includes(right) || right.includes(left)) return true;
  const leftTokens = new Set(left.split(" ").filter((token) => token.length > 2));
  const rightTokens = new Set(right.split(" ").filter((token) => token.length > 2));
  if (leftTokens.size === 0 || rightTokens.size === 0) return false;
  const shared = [...leftTokens].filter((token) => rightTokens.has(token)).length;
  return shared / Math.min(leftTokens.size, rightTokens.size) >= 0.4;
}

function readPositiveInteger(raw: string | undefined, fallback: number): number {
  if (!raw) return fallback;
  const parsed = Number.parseInt(raw, 10);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
}

function readUnitInterval(raw: string | undefined, fallback: number): number {
  if (!raw) return fallback;
  const parsed = Number(raw);
  return Number.isFinite(parsed) && parsed >= 0 && parsed <= 1 ? parsed : fallback;
}
