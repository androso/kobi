import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import OpenAI from "openai";
import { zodTextFormat } from "openai/helpers/zod";
import { z } from "zod";
import type { LessonState } from "@kobi/ai-core";
import type { SessionContext } from "@kobi/activities";

const DEFAULT_CHECKPOINT_MODEL = "gpt-5.4-mini";

/**
 * The checkpoint gate between Understand and Propose. Replaces the old
 * static `confidence >= 0.5` threshold with an OpenAI judgment call: is the
 * lesson_state material accumulated since the last ready checkpoint
 * sufficient AND valid to generate a classroom activity right now?
 *
 * Consumes only bounded SessionContext + structured LessonState fields —
 * never raw transcript (same rule as Area C generation).
 */
export const checkpointDecisionSchema = z
  .object({
    ready: z
      .boolean()
      .describe("True if there is enough valid material to generate an activity artifact now"),
    reason: z.string().min(1).max(400).describe("Short explanation in Spanish for the decision"),
    summary: z
      .string()
      .min(1)
      .max(400)
      .describe("1-2 sentence Spanish rollup of what has been taught so far"),
  })
  .strict();

export type CheckpointDecision = z.infer<typeof checkpointDecisionSchema>;

export interface CheckpointDecisionRequest {
  model: string;
  systemPrompt: string;
  userPrompt: string;
  schemaName: string;
}

export interface CheckpointDecisionClient {
  evaluateCheckpoint(request: CheckpointDecisionRequest): Promise<unknown>;
}

export class ResponsesOpenAiCheckpointClient implements CheckpointDecisionClient {
  constructor(private readonly openai: OpenAI) {}

  async evaluateCheckpoint(request: CheckpointDecisionRequest): Promise<unknown> {
    const response = await this.openai.responses.parse({
      model: request.model,
      input: [
        { role: "system", content: request.systemPrompt },
        { role: "user", content: request.userPrompt },
      ],
      store: false,
      text: {
        format: zodTextFormat(checkpointDecisionSchema, request.schemaName),
        verbosity: "low",
      },
      reasoning: {
        effort: "low",
      },
    });

    if (!response.output_parsed) {
      throw new Error("OpenAI checkpoint evaluation returned no parsed output");
    }

    return response.output_parsed;
  }
}

export function createOpenAiCheckpointClient(apiKey: string): CheckpointDecisionClient {
  return new ResponsesOpenAiCheckpointClient(new OpenAI({ apiKey }));
}

export interface EvaluateCheckpointInput {
  sessionContext: SessionContext;
  lessonStates: LessonState[];
}

export interface EvaluateCheckpointOptions {
  client: CheckpointDecisionClient;
  model: string;
  systemPrompt?: string;
}

export async function evaluateCheckpoint(
  input: EvaluateCheckpointInput,
  options: EvaluateCheckpointOptions,
): Promise<CheckpointDecision> {
  if (input.lessonStates.length === 0) {
    throw new Error("evaluateCheckpoint: at least one lessonState is required");
  }

  const systemPrompt = options.systemPrompt ?? (await loadCheckpointPromptTemplate());
  const userPrompt = buildCheckpointUserPrompt(input);

  const raw = await options.client.evaluateCheckpoint({
    model: options.model,
    systemPrompt,
    userPrompt,
    schemaName: "checkpoint_decision",
  });

  return checkpointDecisionSchema.parse(raw);
}

function buildCheckpointUserPrompt(input: EvaluateCheckpointInput): string {
  const { sessionContext, lessonStates } = input;

  return JSON.stringify(
    {
      session_context: sessionContext,
      segment_count: lessonStates.length,
      confidences: lessonStates.map((state) => state.confidence),
      latest_transcript_summary: lessonStates.at(-1)?.transcript_summary ?? null,
    },
    null,
    2,
  );
}

export async function loadCheckpointPromptTemplate(): Promise<string> {
  return readPromptFile("system.md");
}

async function readPromptFile(filename: string): Promise<string> {
  const candidates = [
    resolve(process.cwd(), "prompts", "checkpoint", filename),
    resolve(process.cwd(), "..", "..", "prompts", "checkpoint", filename),
  ];

  for (const candidate of candidates) {
    try {
      return await readFile(candidate, "utf8");
    } catch (error) {
      if (error && typeof error === "object" && "code" in error && error.code === "ENOENT") {
        continue;
      }
      throw error;
    }
  }

  throw new Error(`Checkpoint prompt file not found: ${filename}`);
}

export function validateCheckpointConfig(env: NodeJS.ProcessEnv): {
  ok: boolean;
  model: string;
  errors: string[];
} {
  const apiKey = env.OPENAI_API_KEY?.trim();
  const model = env.OPENAI_CHECKPOINT_MODEL?.trim() || DEFAULT_CHECKPOINT_MODEL;
  const errors: string[] = [];

  if (!apiKey) errors.push("OPENAI_API_KEY is required for checkpoint evaluation");

  return { ok: errors.length === 0, model, errors };
}

/**
 * Builds the evaluator function from env, or throws if OpenAI isn't
 * configured. Unlike Area C generation, the checkpoint gate has no
 * deterministic fallback — it is the sole decision point for Propose.
 */
export function createCheckpointEvaluatorFromEnv(
  env: NodeJS.ProcessEnv = process.env,
): (input: EvaluateCheckpointInput) => Promise<CheckpointDecision> {
  const validation = validateCheckpointConfig(env);
  if (!validation.ok) {
    throw new Error(`Checkpoint evaluation config is invalid: ${validation.errors.join("; ")}`);
  }

  const client = createOpenAiCheckpointClient(env.OPENAI_API_KEY ?? "");
  return (input) => evaluateCheckpoint(input, { client, model: validation.model });
}
