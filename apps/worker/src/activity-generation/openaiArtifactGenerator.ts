import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import OpenAI from "openai";
import { zodTextFormat } from "openai/helpers/zod";
import { z } from "zod";
import type { LessonState } from "@kobi/ai-core";
import type { CurriculumMatch } from "@kobi/curriculum";
import {
  ACTIVITY_ARTIFACT_CONTRACT_VERSION,
  ACTIVITY_SDK_VERSION,
  activityManifestSchema,
  createGamePlan,
  evidenceFromCurriculumMatches,
  verifyActivityArtifact,
  type ActivityArtifactCandidate,
  type ActivityFamily,
  type ActivityManifest,
  type ActivityVerifierScores,
  type CreateActivityCandidatesInput,
  type DifficultyBand,
  type SessionContext,
} from "@kobi/activities/server";

const difficultyBandSchema = z.enum(["support", "core", "challenge"]);
const activityFamilySchema = z.enum([
  "match_classify",
  "sequence_order",
  "guided_practice",
]);
const activityCapabilitySchema = z.enum(["dom", "css", "svg", "canvas"]);
const activityTelemetryEventTypeSchema = z.enum(["attempt", "hint", "complete"]);

const rawManifestDraftSchema = z
  .object({
    family: activityFamilySchema,
    mechanic: z.string().optional(),
    title: z.string().min(3).max(90),
    est_minutes: z.number().int().min(3).max(12),
    allowed_capabilities: z.array(activityCapabilitySchema).min(1).max(4),
    learning_design: z.object({
      learning_goal: z.string().min(1).max(240),
      interaction_summary: z.string().min(1).max(320),
      success_criteria: z.array(z.string().min(1).max(180)).min(1).max(5),
    }).optional(),
    visual_theme: z.object({
      scene: z.string().min(1).max(120),
      accent: z.string().min(1).max(80),
    }).optional(),
    content: z
      .object({
        items: z
          .array(
            z
              .object({
                prompt: z.string().min(1).max(600),
                answer_key: z.array(z.string().min(1).max(160)).min(1).max(12),
                hints: z.array(z.string().min(1).max(220)).max(4),
              })
              .strict(),
          )
          .min(1)
          .max(8),
        telemetry_events: z
          .array(activityTelemetryEventTypeSchema)
          .min(1)
          .max(3)
          .nullable()
          .describe("Telemetry events used by the artifact, or null to use the default SDK event set."),
      })
      .strict(),
  })
  .strict();

const rawArtifactDraftSchema = z
  .object({
    difficulty_band: difficultyBandSchema,
    manifest_draft: rawManifestDraftSchema,
    index_html: z.string().min(1).max(120_000),
  })
  .strict();

export const openAiActivityDraftResponseSchema = z
  .object({
    artifacts: z.array(rawArtifactDraftSchema).min(1).max(3),
  })
  .strict();

export type OpenAiActivityDraftResponse = z.infer<typeof openAiActivityDraftResponseSchema>;
export type OpenAiActivityDraft = z.infer<typeof rawArtifactDraftSchema>;

export interface ActivityPromptTemplates {
  system: string;
  repair: string;
}

export interface OpenAiActivityDraftRequest {
  model: string;
  systemPrompt: string;
  userPrompt: string;
  schemaName: string;
}

export interface OpenAiActivityDraftClient {
  generateActivityDrafts(request: OpenAiActivityDraftRequest): Promise<unknown>;
}

export interface GenerateOpenAiActivityCandidatesInput extends CreateActivityCandidatesInput {
  bands: DifficultyBand[];
  parentIdByBand?: Partial<Record<DifficultyBand, string | null>>;
}

export interface GenerateOpenAiActivityCandidatesOptions {
  client: OpenAiActivityDraftClient;
  model: string;
  templates?: ActivityPromptTemplates;
  maxRepairAttempts?: number;
  bundleRefFactory?: () => string;
}

export interface OpenAiActivityGenerationResult {
  candidates: ActivityArtifactCandidate[];
  attempted: boolean;
  attempts: number;
  errors: string[];
}

interface BuildPromptInput extends CreateActivityCandidatesInput {
  bands: DifficultyBand[];
  verifierErrors?: Partial<Record<DifficultyBand, string[]>>;
}

const defaultInitialVerifierScores: ActivityVerifierScores = {
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
};

export class ResponsesOpenAiActivityDraftClient implements OpenAiActivityDraftClient {
  constructor(private readonly openai: OpenAI) {}

  async generateActivityDrafts(request: OpenAiActivityDraftRequest): Promise<unknown> {
    const response = await this.openai.responses.parse({
      model: request.model,
      input: [
        { role: "system", content: request.systemPrompt },
        { role: "user", content: request.userPrompt },
      ],
      store: false,
      text: {
        format: zodTextFormat(openAiActivityDraftResponseSchema, request.schemaName),
        verbosity: "low",
      },
      reasoning: {
        effort: "low",
      },
    });

    if (!response.output_parsed) {
      throw new Error("OpenAI activity generation returned no parsed output");
    }

    return response.output_parsed;
  }
}

export function createOpenAiActivityDraftClient(apiKey: string): OpenAiActivityDraftClient {
  return new ResponsesOpenAiActivityDraftClient(new OpenAI({ apiKey }));
}

export function createOpenAiActivityGeneratorFromEnv(
  env: NodeJS.ProcessEnv = process.env,
): ((input: GenerateOpenAiActivityCandidatesInput) => Promise<OpenAiActivityGenerationResult>) | null {
  const validation = validateOpenAiActivityConfig(env);
  if (!validation.enabled) return null;
  if (!validation.ok) {
    throw new Error(`OpenAI activity generation config is invalid: ${validation.errors.join("; ")}`);
  }

  const client = createOpenAiActivityDraftClient(env.OPENAI_API_KEY ?? "");
  return (input) =>
    generateOpenAiActivityCandidates(input, {
      client,
      model: validation.model,
    });
}

export function validateOpenAiActivityConfig(env: NodeJS.ProcessEnv): {
  enabled: boolean;
  ok: boolean;
  model: string;
  errors: string[];
} {
  const apiKey = env.OPENAI_API_KEY?.trim();
  const model = env.OPENAI_ACTIVITY_MODEL?.trim() || "gpt-5.5";
  const explicitlyEnabled = env.OPENAI_ACTIVITY_GENERATION === "enabled";
  const enabled = explicitlyEnabled || Boolean(apiKey);
  const errors: string[] = [];

  if (!enabled) {
    return { enabled: false, ok: true, model, errors };
  }

  if (!apiKey) errors.push("OPENAI_API_KEY is required when OpenAI activity generation is enabled");
  if (!model) errors.push("OPENAI_ACTIVITY_MODEL is required when OpenAI activity generation is enabled");

  return {
    enabled,
    ok: errors.length === 0,
    model,
    errors,
  };
}

export async function loadActivityPromptTemplates(): Promise<ActivityPromptTemplates> {
  const [system, repair] = await Promise.all([
    readPromptFile("system.md"),
    readPromptFile("repair.md"),
  ]);

  return { system, repair };
}

async function readPromptFile(filename: string): Promise<string> {
  const candidates = [
    resolve(process.cwd(), "prompts", "activity-generation", filename),
    resolve(process.cwd(), "..", "..", "prompts", "activity-generation", filename),
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

  throw new Error(`Activity generation prompt file not found: ${filename}`);
}

export async function generateOpenAiActivityCandidates(
  input: GenerateOpenAiActivityCandidatesInput,
  options: GenerateOpenAiActivityCandidatesOptions,
): Promise<OpenAiActivityGenerationResult> {
  const bands = [...new Set(input.bands)];
  if (bands.length === 0 || input.curriculumMatches.length === 0) {
    return { candidates: [], attempted: false, attempts: 0, errors: [] };
  }

  const templates = options.templates ?? (await loadActivityPromptTemplates());
  const bundleRefFactory = options.bundleRefFactory ?? (() => createUnguessableBundleRef("openai"));
  const maxRepairAttempts = options.maxRepairAttempts ?? 2;
  const errors: string[] = [];
  let attempts = 0;

  const firstAttempt = await requestAndNormalizeDrafts(
    input,
    {
      model: options.model,
      client: options.client,
      systemPrompt: templates.system,
      userPrompt: buildActivityGenerationPrompt(input),
      bundleRefFactory,
    },
  );
  attempts += 1;
  errors.push(...firstAttempt.errors);

  const accepted = new Map<DifficultyBand, ActivityArtifactCandidate>();
  const failedVerifierErrors: Partial<Record<DifficultyBand, string[]>> = {};

  for (const candidate of firstAttempt.candidates) {
    const result = verifyActivityArtifact(candidate);
    if (result.ok) {
      accepted.set(candidate.manifest.difficulty_band, candidate);
    } else {
      failedVerifierErrors[candidate.manifest.difficulty_band] = result.errors;
      errors.push(
        ...result.errors.map(
          (error) => `${candidate.manifest.difficulty_band} verifier: ${error}`,
        ),
      );
    }
  }
  recordMissingDraftBands(bands, firstAttempt.candidates, failedVerifierErrors);

  for (let repairIndex = 0; repairIndex < maxRepairAttempts; repairIndex += 1) {
    const missingBands = bands.filter((band) => !accepted.has(band));
    if (missingBands.length === 0) break;

    const repairAttempt = await requestAndNormalizeDrafts(
      { ...input, bands: missingBands },
      {
        model: options.model,
        client: options.client,
        systemPrompt: `${templates.system}\n\n${templates.repair}`,
        userPrompt: buildActivityGenerationPrompt({
          ...input,
          bands: missingBands,
          verifierErrors: failedVerifierErrors,
        }),
        bundleRefFactory,
      },
    );
    attempts += 1;
    errors.push(...repairAttempt.errors);

    for (const candidate of repairAttempt.candidates) {
      const result = verifyActivityArtifact(candidate);
      if (result.ok) {
        accepted.set(candidate.manifest.difficulty_band, candidate);
      } else {
        failedVerifierErrors[candidate.manifest.difficulty_band] = result.errors;
        errors.push(
          ...result.errors.map(
            (error) => `${candidate.manifest.difficulty_band} repair verifier: ${error}`,
          ),
        );
      }
    }
    recordMissingDraftBands(missingBands, repairAttempt.candidates, failedVerifierErrors);
  }

  return {
    candidates: bands.flatMap((band) => {
      const candidate = accepted.get(band);
      return candidate ? [candidate] : [];
    }),
    attempted: true,
    attempts,
    errors,
  };
}

async function requestAndNormalizeDrafts(
  input: GenerateOpenAiActivityCandidatesInput,
  request: {
    client: OpenAiActivityDraftClient;
    model: string;
    systemPrompt: string;
    userPrompt: string;
    bundleRefFactory: () => string;
  },
): Promise<{ candidates: ActivityArtifactCandidate[]; errors: string[] }> {
  try {
    const raw = await request.client.generateActivityDrafts({
      model: request.model,
      systemPrompt: request.systemPrompt,
      userPrompt: request.userPrompt,
      schemaName: "kobi_activity_artifacts",
    });
    return normalizeOpenAiActivityDrafts(raw, input, request.bundleRefFactory);
  } catch (error) {
    return {
      candidates: [],
      errors: [error instanceof Error ? error.message : "OpenAI activity generation failed"],
    };
  }
}

export function normalizeOpenAiActivityDrafts(
  raw: unknown,
  input: GenerateOpenAiActivityCandidatesInput,
  bundleRefFactory: () => string = createUnguessableBundleRef,
): { candidates: ActivityArtifactCandidate[]; errors: string[] } {
  const parsed = openAiActivityDraftResponseSchema.safeParse(raw);
  if (!parsed.success) {
    return {
      candidates: [],
      errors: parsed.error.issues.map((issue) => `draft schema: ${issue.path.join(".")}: ${issue.message}`),
    };
  }

  const requestedBands = new Set(input.bands);
  const evidence = evidenceFromCurriculumMatches(input.curriculumMatches);
  const primaryMatch = input.curriculumMatches[0];
  const gamePlan = createGamePlan(input.sessionContext, input.curriculumMatches);
  const activitySetId = `set-${primaryMatch.objective_code}-${gamePlan.mechanic}`.replace(/[^a-z0-9-]/gi, "-").toLocaleLowerCase("es-SV");
  const errors: string[] = [];
  const candidates: ActivityArtifactCandidate[] = [];
  const seenRequestedBands = new Set<DifficultyBand>();

  for (const artifact of parsed.data.artifacts) {
    if (!requestedBands.has(artifact.difficulty_band)) {
      errors.push(`draft schema: unexpected difficulty band ${artifact.difficulty_band}`);
      continue;
    }
    seenRequestedBands.add(artifact.difficulty_band);

    const manifest: ActivityManifest = {
      family: gamePlan.family as ActivityFamily,
      mechanic: gamePlan.mechanic,
      title: artifact.manifest_draft.title,
      difficulty_band: artifact.difficulty_band,
      curriculum: {
        grade: primaryMatch.grade,
        subject: primaryMatch.subject,
        unit: primaryMatch.unit,
        objective: primaryMatch.objective_code,
      },
      est_minutes: artifact.manifest_draft.est_minutes,
      content: normalizeDraftContent(artifact.manifest_draft.content),
      entry: "index.html",
      sdk_version: ACTIVITY_SDK_VERSION,
      allowed_capabilities: artifact.manifest_draft.allowed_capabilities,
      learning_design: artifact.manifest_draft.learning_design ?? {
        learning_goal: gamePlan.learning_goal,
        interaction_summary: `${gamePlan.interaction_metaphor}: ${gamePlan.band_requirements[artifact.difficulty_band]}`,
        success_criteria: ["Completa la interaccion", "Conecta la respuesta con el objetivo"],
      },
      visual_theme: artifact.manifest_draft.visual_theme ?? {
        scene: gamePlan.interaction_metaphor,
        accent: "azul Kobi",
      },
    };

    const manifestResult = activityManifestSchema.safeParse(manifest);
    if (!manifestResult.success) {
      errors.push(
        ...manifestResult.error.issues.map(
          (issue) => `${artifact.difficulty_band} manifest: ${issue.path.join(".")}: ${issue.message}`,
        ),
      );
      continue;
    }

    candidates.push({
      contract_version: ACTIVITY_ARTIFACT_CONTRACT_VERSION,
      manifest: manifestResult.data,
      bundle_ref: bundleRefFactory(),
      bundle_html: ensureSecurityAndDesignBrief(artifact.index_html),
      verifier_scores: defaultInitialVerifierScores,
      evidence,
      parent_id: input.parentIdByBand?.[artifact.difficulty_band] ?? null,
      activity_set_id: activitySetId,
      status: "candidate",
    });
  }

  for (const band of input.bands) {
    if (!seenRequestedBands.has(band)) {
      errors.push(`draft schema: missing requested difficulty band ${band}`);
    }
  }

  return { candidates, errors };
}

function ensureSecurityAndDesignBrief(html: string): string {
  const csp = `<meta http-equiv="Content-Security-Policy" content="default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; img-src data:; connect-src 'none'; base-uri 'none'; form-action 'none'">`;
  const design = `<style>:focus-visible{outline:3px solid #f59e0b;outline-offset:3px}button{border-radius:14px;padding:12px 16px;background:#2563eb;color:white}body{font-family:system-ui,sans-serif;background:#eff6ff;color:#0f172a}@media (prefers-reduced-motion: reduce){*{animation:none!important;transition:none!important}}</style>`;
  if (/<meta[^>]+http-equiv=["']Content-Security-Policy["']/i.test(html)) return html;
  return html.replace(/<head>/i, `<head>${csp}${design}`);
}

function recordMissingDraftBands(
  requestedBands: DifficultyBand[],
  candidates: ActivityArtifactCandidate[],
  failedVerifierErrors: Partial<Record<DifficultyBand, string[]>>,
) {
  const returnedBands = new Set(candidates.map((candidate) => candidate.manifest.difficulty_band));
  for (const band of requestedBands) {
    if (!returnedBands.has(band)) {
      failedVerifierErrors[band] = ["draft schema: missing requested difficulty band"];
    }
  }
}

function normalizeDraftContent(content: OpenAiActivityDraft["manifest_draft"]["content"]): ActivityManifest["content"] {
  return content.telemetry_events === null
    ? { items: content.items }
    : { items: content.items, telemetry_events: content.telemetry_events };
}

export function buildActivityGenerationPrompt(input: BuildPromptInput): string {
  return JSON.stringify(
    {
      task: "Generate one activity artifact draft for each requested band.",
      requested_bands: input.bands,
      artifact_contract: {
        allowed_families: ["match_classify", "sequence_order", "guided_practice"],
        required_shared_game_plan: createGamePlan(input.sessionContext, input.curriculumMatches),
        required_new_manifest_fields: ["mechanic", "learning_design.learning_goal", "learning_design.interaction_summary", "learning_design.success_criteria", "visual_theme.scene", "visual_theme.accent"],
        content_modes: [
          "exercise items with prompts, answer keys, hints, and telemetry_events as an array or null",
        ],
      },
      creativity_brief: {
        design_goal:
          "Create a memorable, curriculum-grounded mini-app that feels like a small classroom manipulative, lab, or studio rather than a static worksheet.",
        interaction_patterns: [
          "sorting board",
          "evidence map",
          "headline workshop",
          "source-check desk",
          "story sequencer",
          "vocabulary lab",
          "argument builder",
          "timeline",
          "checklist inspector",
        ],
        band_differentiation: {
          support: "scaffold with fewer choices, clear labels, and guided hints",
          core: "let students apply the concept with meaningful feedback",
          challenge: "ask students to explain, justify, compare, or synthesize",
        },
        visual_contract: "Use Kobi blue foundation, rounded surfaces, clear typography, generous spacing, responsive phone/laptop layout, visible focus, readable contrast, touch-friendly controls, reduced-motion support, immediate feedback, no external assets.",
        avoid: [
          "generic multiple-choice unless it is clearly the strongest fit",
          "decorative effects that do not support the learning task",
          "long reading passages or dense instructions",
        ],
      },
      sdk: {
        version: ACTIVITY_SDK_VERSION,
        exact_version_string_required_in_html: ACTIVITY_SDK_VERSION,
        required_inline_js_constant: `const SDK_VERSION = "${ACTIVITY_SDK_VERSION}";`,
        required_methods: [
          "getManifest",
          "getBand",
          "reportAttempt",
          "reportHint",
          "reportComplete",
        ],
      },
      lesson_state: minimizeLessonState(input.lessonState),
      session_context: minimizeSessionContext(input.sessionContext),
      curriculum_matches: input.curriculumMatches.map((match) => ({
        objective_code: match.objective_code,
        unit: match.unit,
        grade: match.grade,
        subject: match.subject,
        text: match.text,
        similarity: match.similarity,
      })),
      verifier_errors: input.verifierErrors ?? {},
    },
    null,
    2,
  );
}

function minimizeLessonState(lessonState: LessonState) {
  return {
    topic: lessonState.topic,
    objective_guess: lessonState.objective_guess,
    key_terms: lessonState.key_terms.slice(0, 12),
    confidence: lessonState.confidence,
  };
}

function minimizeSessionContext(context: SessionContext): SessionContext {
  return {
    latest_topic: context.latest_topic,
    latest_objective: context.latest_objective,
    vocabulary: context.vocabulary.slice(0, 12),
    examples_used: context.examples_used.slice(0, 4).map(redactPotentialNames).map(truncateExample),
    misconceptions: context.misconceptions.slice(0, 4).map(redactPotentialNames),
    time_remaining_minutes: context.time_remaining_minutes,
    confidence: context.confidence,
    segment_count: context.segment_count,
  };
}

function redactPotentialNames(value: string): string {
  return value.replace(
    /\b[A-ZÁÉÍÓÚÑ][a-záéíóúñ]+(?:\s+[A-ZÁÉÍÓÚÑ][a-záéíóúñ]+)+\b/g,
    "[nombre]",
  );
}

function truncateExample(value: string): string {
  return value.length > 120 ? `${value.slice(0, 117)}...` : value;
}

export function createUnguessableBundleRef(namespace?: string): string {
  const path = namespace ? `${namespace}/${randomUUID()}` : randomUUID();
  return `artifact-bundles/${path}/index.html`;
}
