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
  createUnguessableBundleRef,
  evidenceFromCurriculumMatches,
  verifyActivityArtifact,
  type ActivityArtifactCandidate,
  type ActivityManifest,
  type ActivityVerifierScores,
  type CreateActivityCandidatesInput,
  type DifficultyBand,
  type SessionContext,
} from "@kobi/activities/server";
import type { ActivityRuntimeVerifier } from "./runtimeVerifier.js";

const difficultyBandSchema = z.enum(["support", "core", "challenge"]);
const activityFamilySchema = z
  .string()
  .min(1)
  .max(64)
  .regex(/^[a-z][a-z0-9]*(?:_[a-z0-9]+)*$/, "family must be a snake_case slug");
const activityCapabilitySchema = z.enum([
  "dom",
  "css",
  "svg",
  "canvas",
  "audio",
  "webgl",
  "animation",
]);
const activityTelemetryEventTypeSchema = z.enum(["attempt", "hint", "complete"]);

const rawManifestDraftSchema = z
  .object({
    family: activityFamilySchema,
    mechanic: z
      .string()
      .min(1)
      .max(64)
      .regex(/^[a-z][a-z0-9]*(?:_[a-z0-9]+)*$/, "mechanic must be a snake_case slug"),
    title: z.string().min(3).max(90),
    est_minutes: z.number().int().min(1).max(45),
    allowed_capabilities: z.array(activityCapabilitySchema).min(1).max(7),
    experience: z.object({
      type: z.enum([
        "simulation",
        "interactive_laboratory",
        "creative_studio",
        "guided_inquiry",
        "learning_game",
        "practice_tool",
        "exploration",
      ]),
      assessment_mode: z.enum(["scored", "mastery", "reflection", "exploration"]),
      interaction_model: z.string().min(1).max(240),
      adaptive_features: z.array(z.string().min(1).max(160)).max(8),
    }),
    learning_design: z.object({
      learning_goal: z.string().min(1).max(240),
      interaction_summary: z.string().min(1).max(320),
      success_criteria: z.array(z.string().min(1).max(180)).min(1).max(5),
    }),
    visual_theme: z.object({
      scene: z.string().min(1).max(120),
      accent: z.string().min(1).max(80),
    }),
    content: z
      .object({
        items: z
          .array(
            z
              .object({
                prompt: z.string().min(1).max(600),
                answer_key: z.array(z.string().min(1).max(160)).max(12),
                hints: z.array(z.string().min(1).max(220)).max(4),
              })
              .strict(),
          )
          .min(1)
          .max(24),
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

const activityReviewFindingSchema = z
  .object({
    difficulty_band: difficultyBandSchema.nullable(),
    category: z.enum([
      "curriculum_alignment",
      "answer_correctness",
      "age_fit",
      "band_coherence",
      "engagement",
      "adaptive_support",
      "runtime_contract",
      "safety",
      "usability",
    ]),
    severity: z.enum(["warning", "error"]),
    message: z.string().min(1).max(500),
  })
  .strict();

export const openAiActivityReviewResponseSchema = z
  .object({
    approved: z.boolean(),
    findings: z.array(activityReviewFindingSchema).max(18),
  })
  .strict();

export type OpenAiActivityDraftResponse = z.infer<typeof openAiActivityDraftResponseSchema>;
export type OpenAiActivityDraft = z.infer<typeof rawArtifactDraftSchema>;
export type OpenAiActivityReviewResponse = z.infer<typeof openAiActivityReviewResponseSchema>;

export interface ActivityPromptTemplates {
  system: string;
  repair: string;
  review: string;
}

export interface OpenAiActivityDraftRequest {
  model: string;
  systemPrompt: string;
  userPrompt: string;
  schemaName: string;
}

export type OpenAiActivityReviewRequest = OpenAiActivityDraftRequest;

export interface OpenAiActivityDraftClient {
  generateActivityDrafts(request: OpenAiActivityDraftRequest): Promise<unknown>;
  reviewActivityCandidates(request: OpenAiActivityReviewRequest): Promise<unknown>;
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
  maxReviewRepairAttempts?: number;
  runtimeVerifier?: ActivityRuntimeVerifier | null;
  bundleRefFactory?: () => string;
}

export interface OpenAiActivityGenerationResult {
  candidates: ActivityArtifactCandidate[];
  attempted: boolean;
  attempts: number;
  errors: string[];
  diagnostics?: string[];
}

interface BuildPromptInput extends CreateActivityCandidatesInput {
  bands: DifficultyBand[];
  verifierErrors?: Partial<Record<DifficultyBand, string[]>>;
}

interface ActivityReviewResult {
  approved: boolean;
  errors: string[];
  errorsByBand: Partial<Record<DifficultyBand, string[]>>;
  rejectedBands: DifficultyBand[];
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

  async reviewActivityCandidates(request: OpenAiActivityReviewRequest): Promise<unknown> {
    const response = await this.openai.responses.parse({
      model: request.model,
      input: [
        { role: "system", content: request.systemPrompt },
        { role: "user", content: request.userPrompt },
      ],
      store: false,
      text: {
        format: zodTextFormat(openAiActivityReviewResponseSchema, request.schemaName),
        verbosity: "low",
      },
      reasoning: {
        effort: "medium",
      },
    });

    if (!response.output_parsed) {
      throw new Error("OpenAI activity review returned no parsed output");
    }

    return response.output_parsed;
  }
}

export function createOpenAiActivityDraftClient(apiKey: string): OpenAiActivityDraftClient {
  return new ResponsesOpenAiActivityDraftClient(new OpenAI({ apiKey }));
}

export function createOpenAiActivityGeneratorFromEnv(
  env: NodeJS.ProcessEnv = process.env,
  options: Pick<GenerateOpenAiActivityCandidatesOptions, "runtimeVerifier"> = {},
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
      runtimeVerifier: options.runtimeVerifier,
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
  const [system, repair, review] = await Promise.all([
    readPromptFile("system.md"),
    readPromptFile("repair.md"),
    readPromptFile("review.md"),
  ]);

  return { system, repair, review };
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
  const maxReviewRepairAttempts = options.maxReviewRepairAttempts ?? 3;
  const errors: string[] = [];
  const diagnostics: string[] = [];
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
    const result = await verifyGeneratedCandidate(candidate, options.runtimeVerifier ?? null);
    if (!result.ok) {
      failedVerifierErrors[candidate.manifest.difficulty_band] = result.errors;
      errors.push(
        ...result.errors.map(
          (error) => `${candidate.manifest.difficulty_band} verifier: ${error}`,
        ),
      );
      continue;
    }

    accepted.set(candidate.manifest.difficulty_band, candidate);
  }
  recordMissingDraftBands(bands, firstAttempt.candidates, failedVerifierErrors);

  for (let repairIndex = 0; repairIndex < maxRepairAttempts; repairIndex += 1) {
    const missingBands = bands.filter((band) => !accepted.has(band));
    if (missingBands.length === 0) break;

    const repairAttempt = await requestAndNormalizeDrafts(
      {
        ...input,
        bands: missingBands,
        verifierErrors: failedVerifierErrors,
      },
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
      const result = await verifyGeneratedCandidate(candidate, options.runtimeVerifier ?? null);
      if (!result.ok) {
        failedVerifierErrors[candidate.manifest.difficulty_band] = result.errors;
        errors.push(
          ...result.errors.map(
            (error) => `${candidate.manifest.difficulty_band} repair verifier: ${error}`,
          ),
        );
        continue;
      }

      accepted.set(candidate.manifest.difficulty_band, candidate);
    }
    recordMissingDraftBands(missingBands, repairAttempt.candidates, failedVerifierErrors);
  }

  const candidates = bands.flatMap((band) => {
    const candidate = accepted.get(band);
    return candidate ? [candidate] : [];
  });

  const reviewResults = await Promise.all(
    candidates.map((candidate) =>
      reviewAndRepairCandidate(candidate, input, {
        client: options.client,
        model: options.model,
        runtimeVerifier: options.runtimeVerifier ?? null,
        templates,
        bundleRefFactory,
        maxReviewRepairAttempts,
      }),
    ),
  );
  attempts += reviewResults.reduce((total, result) => total + result.repairAttempts, 0);
  errors.push(...reviewResults.flatMap((result) => result.errors));
  diagnostics.push(...reviewResults.flatMap((result) => result.diagnostics));

  const reviewedByBand = new Map(
    reviewResults.flatMap((result) =>
      result.candidate
        ? [[result.candidate.manifest.difficulty_band, result.candidate] as const]
        : [],
    ),
  );
  const reviewedCandidates = bands.flatMap((band) => {
    const candidate = reviewedByBand.get(band);
    return candidate ? [candidate] : [];
  });

  if (bands.includes("core") && !reviewedByBand.has("core")) {
    return {
      candidates: [],
      attempted: true,
      attempts,
      errors,
      diagnostics: diagnostics.length > 0 ? diagnostics : undefined,
    };
  }

  return {
    candidates: reviewedCandidates,
    attempted: true,
    attempts,
    errors,
    diagnostics: diagnostics.length > 0 ? diagnostics : undefined,
  };
}

async function verifyGeneratedCandidate(
  candidate: ActivityArtifactCandidate,
  runtimeVerifier: ActivityRuntimeVerifier | null,
): Promise<{ ok: boolean; errors: string[] }> {
  const staticResult = verifyActivityArtifact(candidate);
  if (!staticResult.ok || !runtimeVerifier) {
    return { ok: staticResult.ok, errors: staticResult.errors };
  }

  try {
    await runtimeVerifier({
      bundleHtml: candidate.bundle_html,
      manifest: candidate.manifest,
    });
    return { ok: true, errors: [] };
  } catch (error) {
    return {
      ok: false,
      errors: [error instanceof Error ? error.message : "isolated runtime verification failed"],
    };
  }
}

async function reviewAndRepairCandidate(
  initialCandidate: ActivityArtifactCandidate,
  input: GenerateOpenAiActivityCandidatesInput,
  options: {
    client: OpenAiActivityDraftClient;
    model: string;
    runtimeVerifier: ActivityRuntimeVerifier | null;
    templates: ActivityPromptTemplates;
    bundleRefFactory: () => string;
    maxReviewRepairAttempts: number;
  },
): Promise<{
  candidate: ActivityArtifactCandidate | null;
  repairAttempts: number;
  errors: string[];
  diagnostics: string[];
}> {
  const band = initialCandidate.manifest.difficulty_band;
  const diagnostics: string[] = [];
  let candidate = initialCandidate;
  let repairAttempts = 0;
  let needsReview = true;
  let repairFeedback: string[] = [];

  while (true) {
    if (needsReview) {
      const review = await reviewOpenAiActivityCandidates([candidate], input, {
        client: options.client,
        model: options.model,
        systemPrompt: options.templates.review,
      });
      diagnostics.push(...review.errors);
      if (review.approved) {
        return { candidate, repairAttempts, errors: [], diagnostics };
      }
      repairFeedback = review.errorsByBand[band] ?? review.errors;
    }

    if (repairAttempts >= options.maxReviewRepairAttempts) {
      return { candidate: null, repairAttempts, errors: repairFeedback, diagnostics };
    }

    const repairAttempt = await requestAndNormalizeDrafts(
      { ...input, bands: [band], verifierErrors: { [band]: repairFeedback } },
      {
        model: options.model,
        client: options.client,
        systemPrompt: `${options.templates.system}\n\n${options.templates.repair}`,
        userPrompt: buildActivityGenerationPrompt({
          ...input,
          bands: [band],
          verifierErrors: { [band]: repairFeedback },
        }),
        bundleRefFactory: options.bundleRefFactory,
      },
    );
    repairAttempts += 1;
    diagnostics.push(...repairAttempt.errors);

    const repaired = repairAttempt.candidates.find(
      (item) => item.manifest.difficulty_band === band,
    );
    if (!repaired) {
      repairFeedback = repairAttempt.errors.length > 0
        ? repairAttempt.errors
        : ["review repair did not return an artifact for this band"];
      needsReview = false;
      continue;
    }

    const verification = await verifyGeneratedCandidate(repaired, options.runtimeVerifier);
    if (!verification.ok) {
      repairFeedback = verification.errors;
      diagnostics.push(
        ...verification.errors.map((error) => `${band} review repair verifier: ${error}`),
      );
      needsReview = false;
      continue;
    }

    candidate = repaired;
    needsReview = true;
  }
}

async function requestAndNormalizeDrafts(
  input: BuildPromptInput,
  request: {
    client: OpenAiActivityDraftClient;
    model: string;
    systemPrompt: string;
    userPrompt: string;
    bundleRefFactory: () => string;
  },
): Promise<{ candidates: ActivityArtifactCandidate[]; errors: string[] }> {
  if (input.bands.length > 1) {
    const perBandResults = await Promise.all(
      input.bands.map((band) => {
        const bandErrors = input.verifierErrors?.[band];
        const bandInput: BuildPromptInput = {
          ...input,
          bands: [band],
          verifierErrors: bandErrors ? { [band]: bandErrors } : {},
        };
        return requestAndNormalizeDrafts(bandInput, {
          ...request,
          userPrompt: buildActivityGenerationPrompt(bandInput),
        });
      }),
    );
    return {
      candidates: perBandResults.flatMap((result) => result.candidates),
      errors: perBandResults.flatMap((result) => result.errors),
    };
  }

  try {
    const raw = await request.client.generateActivityDrafts({
      model: request.model,
      systemPrompt: request.systemPrompt,
      userPrompt: request.userPrompt,
      schemaName: "kobi_activity_artifacts",
    });
    const normalized = normalizeOpenAiActivityDrafts(raw, input, request.bundleRefFactory);
    if (normalized.errors.length > 0) {
      console.warn("[openaiArtifactGenerator] draft normalization issues", {
        errors: normalized.errors,
      });
    }
    return normalized;
  } catch (error) {
    console.error("[openaiArtifactGenerator] OpenAI draft API call failed", {
      error: error instanceof Error ? error.message : error,
    });
    return {
      candidates: [],
      errors: [error instanceof Error ? error.message : "OpenAI activity generation failed"],
    };
  }
}

async function reviewOpenAiActivityCandidates(
  candidates: ActivityArtifactCandidate[],
  input: GenerateOpenAiActivityCandidatesInput,
  request: {
    client: OpenAiActivityDraftClient;
    model: string;
    systemPrompt: string;
  },
): Promise<ActivityReviewResult> {
  try {
    const raw = await request.client.reviewActivityCandidates({
      model: request.model,
      systemPrompt: request.systemPrompt,
      userPrompt: buildActivityReviewPrompt(candidates, input),
      schemaName: "kobi_activity_review",
    });
    const parsed = openAiActivityReviewResponseSchema.safeParse(raw);
    if (!parsed.success) {
      const schemaErrors = parsed.error.issues.map(
        (issue) => `AI review schema: ${issue.path.join(".")}: ${issue.message}`,
      );
      return {
        approved: false,
        errors: schemaErrors,
        errorsByBand: errorsForCandidateBands(candidates, schemaErrors),
        rejectedBands: candidates.map((candidate) => candidate.manifest.difficulty_band),
      };
    }

    const blockingFindings = parsed.data.findings.filter(
      (finding) =>
        finding.severity === "error" &&
        finding.category !== "engagement" &&
        finding.category !== "adaptive_support",
    );
    const approved = blockingFindings.length === 0;
    const errors = parsed.data.findings.map(formatActivityReviewFinding);
    if (!approved && errors.length === 0) errors.push("AI review rejected one or more artifacts");
    const candidateBands = candidates.map((candidate) => candidate.manifest.difficulty_band);
    const errorsByBand: Partial<Record<DifficultyBand, string[]>> = {};
    for (const band of candidateBands) {
      errorsByBand[band] = parsed.data.findings
        .filter((finding) => finding.difficulty_band === null || finding.difficulty_band === band)
        .map(formatActivityReviewFinding);
      if (!approved && errorsByBand[band]?.length === 0) {
        errorsByBand[band] = ["AI review rejected this artifact without a specific finding"];
      }
    }
    const hasSetLevelError = blockingFindings.some((finding) => finding.difficulty_band === null);
    const rejectedBands = approved
      ? []
      : hasSetLevelError
        ? candidateBands
        : [...new Set(blockingFindings.flatMap((finding) =>
            finding.difficulty_band ? [finding.difficulty_band] : []
          ))];
    return {
      approved,
      errors,
      errorsByBand,
      rejectedBands: rejectedBands.length > 0 ? rejectedBands : candidateBands,
    };
  } catch (error) {
    const reviewErrors = [
      `AI review failed: ${error instanceof Error ? error.message : "unknown review error"}`,
    ];
    return {
      approved: false,
      errors: reviewErrors,
      errorsByBand: errorsForCandidateBands(candidates, reviewErrors),
      rejectedBands: candidates.map((candidate) => candidate.manifest.difficulty_band),
    };
  }
}

function formatActivityReviewFinding(
  finding: OpenAiActivityReviewResponse["findings"][number],
): string {
  const effectiveSeverity =
    finding.severity === "error" &&
    (finding.category === "engagement" || finding.category === "adaptive_support")
      ? "warning"
      : finding.severity;
  return `AI review ${effectiveSeverity} ${finding.difficulty_band ?? "set"}/${finding.category}: ${finding.message}`;
}

function errorsForCandidateBands(
  candidates: ActivityArtifactCandidate[],
  errors: string[],
): Partial<Record<DifficultyBand, string[]>> {
  const errorsByBand: Partial<Record<DifficultyBand, string[]>> = {};
  for (const candidate of candidates) {
    errorsByBand[candidate.manifest.difficulty_band] = errors;
  }
  return errorsByBand;
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
      family: artifact.manifest_draft.family,
      mechanic: artifact.manifest_draft.mechanic,
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
      experience: artifact.manifest_draft.experience,
      learning_design: artifact.manifest_draft.learning_design,
      visual_theme: artifact.manifest_draft.visual_theme,
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
      activity_set_id: input.activitySetId,
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
  const design = `<style>:focus-visible{outline:3px solid #f59e0b;outline-offset:3px}button{border-radius:14px;padding:12px 16px;background:#2563eb;color:white}body{font-family:system-ui,sans-serif;background:#eff6ff;color:#0f172a}@media (prefers-reduced-motion: reduce){*{animation:none!important;transition:none!important}}</style>`;
  const withoutModelCsp = html.replace(
    /<meta\b(?=[^>]*\bhttp-equiv\s*=\s*["']Content-Security-Policy["'])[^>]*>/gi,
    "",
  );
  return withoutModelCsp.replace(/<head(\s[^>]*)?>/i, (head) => `${head}${design}`);
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
        experience_policy:
          "Invent the best interactive learning experience from the objective. No renderer, family list, deterministic game plan, or quiz template is imposed.",
        optional_prior_context: input.gamePlan ?? null,
        metadata_contract: {
          family:
            "Invent a descriptive snake_case experience family. Keep it shared across variants only when the variants are adaptations of the same experience.",
          mechanic:
            "Invent a descriptive snake_case interaction mechanic. It describes the experience; it never selects a renderer.",
          experience:
            "Declare the experience type, assessment mode, interaction model, and only adaptive features implemented in code. Use [] when there are none.",
        },
        required_new_manifest_fields: [
          "mechanic",
          "experience.type",
          "experience.assessment_mode",
          "experience.interaction_model",
          "experience.adaptive_features",
          "learning_design.learning_goal",
          "learning_design.interaction_summary",
          "learning_design.success_criteria",
          "visual_theme.scene",
          "visual_theme.accent",
        ],
        content_policy: [
          "content.items provide runtime-owned material for the experience",
          "answer_key may be empty for reflection or exploration experiences",
          "scored and mastery experiences must provide evaluable answer keys or equivalent success criteria",
          "the HTML is a complete interactive application, never a JSON renderer or question-card template",
          "use one canonical answer representation in the manifest, checker, feedback, and telemetry",
          "recompute correctness from current state at completion or lock editing immediately after a successful check",
          "hints coach strategy and never draw, place, select, or reveal the exact scored answer",
          "canvas and SVG primary interactions include keyboard-operable controls or an equivalent accessible path",
        ],
      },
      creativity_brief: {
        design_goal:
          "Build a memorable, curriculum-grounded learning app: simulation, interactive lab, creative studio, guided inquiry, learning game, practice tool, or exploration. The code is the experience; the manifest is editable learning content.",
        skill_focus:
          "Let the learner investigate, manipulate, create, test, explain, model, compare, or practice a concrete ability tied to the lesson objective.",
        interaction_patterns: [
          "simulation with adjustable variables and visible consequences",
          "interactive laboratory with observation and hypothesis cycles",
          "creative studio for composing, annotating, or constructing an artifact",
          "guided inquiry with evidence gathering and reflection",
          "spatial or canvas-based manipulative",
          "timeline, map, system model, story world, or argument builder",
          "adaptive practice that changes scaffolding after learner actions",
          "lightweight learning game with meaningful rules and feedback",
        ],
        band_differentiation: {
          support: "reduce cognitive load, model the first move, and adapt scaffolds based on actions",
          core: "offer an authentic task with learner control, meaningful feedback, and productive struggle",
          challenge: "add synthesis, transfer, competing constraints, explanation, or open-ended creation",
        },
        visual_contract: "Create a coherent responsive app with accessible controls, visible focus, readable contrast, touch targets, reduced-motion support, and visuals that explain the learning system. No external assets.",
        avoid: [
          "primary interaction that is multi-option / A/B/C / radio-button Q&A",
          "static worksheet cards where the student only clicks one answer",
          "a generic dashboard wrapped around questions",
          "fake interactivity, hidden verifier bypass controls, or decoration unrelated to learning",
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
        exact_message_protocol: {
          request: 'window.parent.postMessage({ sdk: SDK_VERSION, type: "request", id, method }, "*")',
          response: 'Listen for { sdk: SDK_VERSION, type: "response", id, ok: true, result }; resolve the matching request id.',
          event: 'window.parent.postMessage({ sdk: SDK_VERSION, type: "event", method, payload }, "*")',
          warning: "The host ignores messages without the exact type field. Do not invent replyTo or method-only envelopes.",
        },
        event_payloads: {
          reportAttempt:
            'Use { item_index: <non-negative integer>, correct: <boolean>, answer?: <student answer> }. The parent adds assignment_id; do not invent one.',
          reportHint:
            'Use { item_index: <non-negative integer>, hint_index: <non-negative integer> }. The parent adds assignment_id; do not invent one.',
          reportComplete:
            'Use either { score_unit: "count", score: <non-negative integer>, total: <positive integer> } with score <= total, or { score_unit: "normalized", score: <number from 0 through 1> } with no total. The parent adds assignment_id.',
        },
        runtime_smoke_controls: {
          attempt: 'Put data-smoke-action="attempt" on one real visible meaningful control. Bind its reportAttempt handler during initial render so one direct click emits a valid event.',
          hint: 'Put data-smoke-action="hint" on one real visible hint control. Bind its reportHint handler during initial render so one direct click emits a valid event.',
          complete: 'Put data-smoke-action="complete" on one real visible meaningful completion/submit control. Bind its reportComplete handler during initial render so one direct click emits a valid event exactly once.',
          completion_state: "Keep completion rendered and visible from initial load. It may begin disabled for learners, but bind its handler immediately. The handler recomputes current score and emits when invoked; the isolated protocol check temporarily enables the real control.",
          policy: "These attributes are test hooks on real student controls, not hidden bypass buttons.",
        },
        completion_score_contract: {
          count: "Send score_unit=count with an integer correct-count score and a positive integer total.",
          normalized: "Send score_unit=normalized with a 0-1 score and omit total.",
          submit_once: "Disable or guard the completion control after the first valid reportComplete call.",
        },
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

export function buildActivityReviewPrompt(
  candidates: ActivityArtifactCandidate[],
  input: GenerateOpenAiActivityCandidatesInput,
): string {
  return JSON.stringify(
    {
      task: "Review every supplied learning artifact. Approve only when each one is safe, functional, grounded, and genuinely useful for learning.",
      experience_intent: input.gamePlan ?? null,
      review_criteria: [
        "The experience directly practices the supplied curriculum objective rather than merely asking recall questions about it.",
        "For scored or mastery experiences, every answer key is correct and supported by curriculum evidence. Reflection and exploration experiences may use empty answer keys when completion is based on meaningful action.",
        "Language, pacing, and instructions fit the grade and subject supplied in curriculum_matches.",
        "The interaction model is authentic: simulation, construction, experimentation, inquiry, creative production, or another purposeful learner action. Reject generic dashboards and disguised quizzes.",
        "Declared adaptive features are implemented in the experience and respond usefully to learner actions.",
        "Hints coach strategy without revealing scored answers.",
        "When multiple bands are supplied, each is independently usable and any progression in support or cognitive demand is coherent; do not reject a valid core artifact merely because another band is absent.",
        "The artifact is usable, self-contained, accessible, and does not request sensitive information.",
        "The real student controls implement getManifest, getBand, reportAttempt, reportHint, and reportComplete through the exact SDK envelope.",
        "reportComplete declares score_unit, follows the count-or-normalized score contract, and cannot be submitted twice.",
        "The manifest answer, checker, feedback, and telemetry use one canonical answer representation; completion never submits stale cached state.",
        "Hints coach without drawing, placing, selecting, or revealing the exact scored answer.",
        "Canvas or SVG primary interactions have keyboard-operable controls or an equivalent accessible path.",
      ],
      lesson_state: minimizeLessonState(input.lessonState),
      curriculum_matches: input.curriculumMatches.map((match) => ({
        objective_code: match.objective_code,
        unit: match.unit,
        grade: match.grade,
        subject: match.subject,
        text: match.text,
      })),
      candidates: candidates.map((candidate) => ({
        difficulty_band: candidate.manifest.difficulty_band,
        manifest: candidate.manifest,
        evidence: candidate.evidence,
        index_html: candidate.bundle_html,
      })),
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
export function createActivitySetId(): string {
  return `set-${randomUUID()}`;
}
