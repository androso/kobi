import { describe, expect, it } from "vitest";
import type { LessonState } from "@kobi/ai-core";
import {
  evaluateContextReadiness,
  readContextReadinessThresholds,
} from "./contextReadiness.js";

const state = (overrides: Partial<LessonState> = {}): LessonState => ({
  topic: "Identificación de ángulos",
  objective_guess: "Identificar ángulos en triángulos y cuadriláteros",
  key_terms: ["ángulo", "triángulo", "cuadrilátero"],
  transcript_summary: "La docente identifica ángulos en figuras.",
  confidence: 0.82,
  evidence: { quoted_phrases: ["ángulos"], reason: "Contenido coherente." },
  ...overrides,
});

describe("context readiness eligibility", () => {
  it("wakes the semantic checkpoint after stable, confident context accumulates", () => {
    expect(evaluateContextReadiness([state(), state({ confidence: 0.76 })])).toMatchObject({
      eligible: true,
      reason: "ready",
      segmentCount: 2,
      confidentSegmentCount: 2,
      stableTopicCount: 2,
    });
  });

  it("waits when the topic is noisy or changes between recent segments", () => {
    expect(evaluateContextReadiness([
      state({ topic: "Triángulos", objective_guess: "Clasificar triángulos" }),
      state({ topic: "La noticia", objective_guess: "Identificar las partes de una noticia" }),
    ])).toMatchObject({
      eligible: false,
      reason: "unstable_topic",
    });
  });

  it("accepts natural wording changes that preserve the same learning anchor", () => {
    expect(evaluateContextReadiness([
      state({ topic: "Ángulos en figuras geométricas" }),
      state({ topic: "Identificación de ángulos en triángulos" }),
    ])).toMatchObject({
      eligible: true,
      reason: "ready",
    });
  });

  it("requires vocabulary grounding when the objective is still unknown", () => {
    expect(evaluateContextReadiness([
      state({ objective_guess: null, key_terms: ["ángulo"] }),
      state({ objective_guess: null, key_terms: ["ángulo"] }),
    ])).toMatchObject({
      eligible: false,
      reason: "insufficient_grounding",
    });
  });

  it("reads configurable thresholds and rejects invalid values", () => {
    expect(readContextReadinessThresholds({
      CHECKPOINT_MIN_SEGMENTS: "3",
      CHECKPOINT_MIN_CONFIDENCE: "0.7",
      CHECKPOINT_MIN_STABLE_SEGMENTS: "2",
      CHECKPOINT_MIN_KEY_TERMS: "4",
    })).toEqual({
      minSegments: 3,
      minConfidence: 0.7,
      minStableSegments: 2,
      minKeyTerms: 4,
    });

    expect(readContextReadinessThresholds({
      CHECKPOINT_MIN_SEGMENTS: "0",
      CHECKPOINT_MIN_CONFIDENCE: "2",
    })).toMatchObject({
      minSegments: 2,
      minConfidence: 0.65,
    });
  });
});
