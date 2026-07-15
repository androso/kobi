import { describe, expect, it } from "vitest";
import type { LessonState } from "@kobi/ai-core";
import type { SessionContext } from "@kobi/activities/contracts";
import {
  evaluateCheckpoint,
  validateCheckpointConfig,
  type CheckpointDecisionClient,
  type CheckpointDecisionRequest,
} from "./evaluateCheckpoint.js";

const sessionContext: SessionContext = {
  latest_topic: "La noticia y sus partes",
  latest_objective: "Identificar titular, entradilla y fuente en una noticia breve",
  vocabulary: ["titular", "entradilla", "fuente"],
  examples_used: ["titular de la noticia"],
  misconceptions: [],
  time_remaining_minutes: 8,
  confidence: 0.82,
  segment_count: 3,
};

const lessonStates: LessonState[] = [
  {
    topic: "La noticia y sus partes",
    objective_guess: "Identificar titular, entradilla y fuente en una noticia breve",
    key_terms: ["titular", "entradilla", "fuente"],
    transcript_summary: "La docente explico la estructura de una noticia.",
    confidence: 0.82,
    evidence: {
      quoted_phrases: ["titular de la noticia"],
      reason: "La clase se centro en reconocer partes de una noticia.",
    },
  },
];

describe("evaluateCheckpoint", () => {
  it("sends the provided prompt and bounded context (no raw transcript field) to the client", async () => {
    const requests: CheckpointDecisionRequest[] = [];
    const client: CheckpointDecisionClient = {
      async evaluateCheckpoint(request) {
        requests.push(request);
        return { ready: true, reason: "Hay suficiente material.", summary: "Se enseño la noticia." };
      },
    };

    const decision = await evaluateCheckpoint(
      { sessionContext, lessonStates },
      { client, model: "gpt-5.4-mini", systemPrompt: "system prompt" },
    );

    expect(decision.ready).toBe(true);
    expect(requests).toHaveLength(1);
    expect(requests[0].systemPrompt).toBe("system prompt");
    expect(requests[0].userPrompt).not.toContain("transcriptText");
    expect(requests[0].userPrompt).not.toContain("rawTranscript");

    const userPayload = JSON.parse(requests[0].userPrompt);
    expect(userPayload.session_context).toEqual(sessionContext);
    expect(userPayload.segment_count).toBe(1);
  });

  it("parses and validates the client response against the decision schema", async () => {
    const client: CheckpointDecisionClient = {
      async evaluateCheckpoint() {
        return { ready: false, reason: "Falta material.", summary: "Aun no hay suficiente contenido." };
      },
    };

    const decision = await evaluateCheckpoint(
      { sessionContext, lessonStates },
      { client, model: "gpt-5.4-mini", systemPrompt: "system prompt" },
    );

    expect(decision).toEqual({
      ready: false,
      reason: "Falta material.",
      summary: "Aun no hay suficiente contenido.",
    });
  });

  it("throws when the client response does not match the schema", async () => {
    const client: CheckpointDecisionClient = {
      async evaluateCheckpoint() {
        return { ready: "yes" };
      },
    };

    await expect(
      evaluateCheckpoint(
        { sessionContext, lessonStates },
        { client, model: "gpt-5.4-mini", systemPrompt: "system prompt" },
      ),
    ).rejects.toThrow();
  });

  it("requires at least one lessonState", async () => {
    const client: CheckpointDecisionClient = {
      async evaluateCheckpoint() {
        return { ready: true, reason: "x", summary: "y" };
      },
    };

    await expect(
      evaluateCheckpoint(
        { sessionContext, lessonStates: [] },
        { client, model: "gpt-5.4-mini", systemPrompt: "system prompt" },
      ),
    ).rejects.toThrow("at least one lessonState");
  });
});

describe("validateCheckpointConfig", () => {
  it("requires OPENAI_API_KEY", () => {
    const result = validateCheckpointConfig({} as NodeJS.ProcessEnv);
    expect(result.ok).toBe(false);
    expect(result.errors).toContain("OPENAI_API_KEY is required for checkpoint evaluation");
  });

  it("defaults the model and passes when OPENAI_API_KEY is set", () => {
    const result = validateCheckpointConfig({ OPENAI_API_KEY: "sk-test" } as NodeJS.ProcessEnv);
    expect(result.ok).toBe(true);
    expect(result.model).toBe("gpt-5.4-mini");
  });

  it("honors OPENAI_CHECKPOINT_MODEL override", () => {
    const result = validateCheckpointConfig({
      OPENAI_API_KEY: "sk-test",
      OPENAI_CHECKPOINT_MODEL: "gpt-5.5",
    } as NodeJS.ProcessEnv);
    expect(result.model).toBe("gpt-5.5");
  });
});
