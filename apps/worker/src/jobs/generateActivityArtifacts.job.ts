import type { SupabaseClient } from "@supabase/supabase-js";
import {
  activityEvidenceSchema,
  activityManifestSchema,
  activityVerifierScoresSchema,
  buildActivitySessionContext,
  createActivityArtifactCandidates,
  hasMaterialContextChange,
  pickReusableActivitiesByBand,
  rankActivityRepositoryRows,
  verifyActivityArtifact,
  type ActivityArtifact,
  type ActivityArtifactCandidate,
  type ActivityRepositoryRow,
  type ActivitySource,
  type DifficultyBand,
  type RankedActivityRepositoryRow,
  type SessionContext,
} from "@kobi/activities/server";
import { lessonStateSchema, type LessonState } from "@kobi/ai-core";
import type { CurriculumMatch } from "@kobi/curriculum";
import type PgBoss from "pg-boss";
import {
  createOpenAiActivityGeneratorFromEnv,
  createUnguessableBundleRef,
  type GenerateOpenAiActivityCandidatesInput,
  type OpenAiActivityGenerationResult,
} from "../activity-generation/openaiArtifactGenerator.js";

export interface GenerateActivityArtifactsJobData {
  checkpointId?: string;
  /** Direct/manual generation remains supported; checkpoint handoffs use checkpointId only. */
  sessionId?: string;
  lessonState?: LessonState;
  curriculumMatches?: CurriculumMatch[];
}

const activityBands: DifficultyBand[] = ["support", "core", "challenge"];

export type OpenAiActivityCandidateGenerator = (
  input: GenerateOpenAiActivityCandidatesInput,
) => Promise<OpenAiActivityGenerationResult>;

export interface GenerateActivityArtifactsJobOptions {
  openAiGenerator?: OpenAiActivityCandidateGenerator | null;
  maxOpenAiGenerationsPerSession?: number;
}

export interface GenerateActivityArtifactsJobResult {
  inserted: number;
  reused: number;
  generated: number;
  skippedReason: string | null;
}

interface CheckpointGenerationClaim {
  checkpointId: string;
  generationStartedAt: string;
}

class CheckpointClaimValidationError extends Error {
  constructor(
    readonly claim: CheckpointGenerationClaim,
    cause: unknown,
  ) {
    super(errorMessage(cause), { cause });
    this.name = "CheckpointClaimValidationError";
  }
}

interface SessionCandidateToInsert {
  sessionId: string;
  activityId: string;
  band: DifficultyBand;
  sessionContext: SessionContext;
  artifact: ActivityArtifact | ActivityRepositoryRow;
  source: ActivitySource;
  origin: "openai" | "static" | "repository";
}

interface PlannedSessionArtifact {
  band: DifficultyBand;
  reusable?: RankedActivityRepositoryRow;
  candidate?: ActivityArtifactCandidate;
  origin?: "openai" | "static";
}

export function registerGenerateActivityArtifactsJob(
  boss: PgBoss,
  supabase: SupabaseClient,
  options: GenerateActivityArtifactsJobOptions = {},
) {
  const openAiGenerator =
    options.openAiGenerator === undefined ? createOpenAiActivityGeneratorFromEnv() : options.openAiGenerator;
  const maxOpenAiGenerationsPerSession =
    options.maxOpenAiGenerationsPerSession ?? readPositiveIntegerEnv("OPENAI_ACTIVITY_MAX_GENERATIONS_PER_SESSION", 3);

  return boss.work<GenerateActivityArtifactsJobData>(
    "generate-activity-artifacts",
    { batchSize: 1 },
    async (jobs) => {
      const job = jobs[0];
      if (!job) return;

      await runGenerateActivityArtifactsJob(supabase, job.data, {
        openAiGenerator,
        maxOpenAiGenerationsPerSession,
      });
    },
  );
}

export async function runGenerateActivityArtifactsJob(
  supabase: SupabaseClient,
  data: GenerateActivityArtifactsJobData,
  options: GenerateActivityArtifactsJobOptions = {},
): Promise<GenerateActivityArtifactsJobResult> {
  let claim: CheckpointGenerationClaim | null = null;
  try {
    let workflow;
    if (data.checkpointId) {
      workflow = await loadAndClaimCheckpoint(supabase, data.checkpointId);
      if (workflow) claim = workflow.claim;
    } else {
      workflow = await loadDirectGenerationContext(supabase, data);
    }
    if (!workflow) return { inserted: 0, reused: 0, generated: 0, skippedReason: "checkpoint already generated" };
    const { sessionId, lessonState, curriculumMatches, sessionContext } = workflow;
    if (curriculumMatches.length === 0) {
      if (claim) await completeCheckpointGeneration(supabase, claim);
      return { inserted: 0, reused: 0, generated: 0, skippedReason: "no curriculum matches" };
    }

    if (await hasCurrentReadyCandidates(supabase, sessionId, sessionContext)) {
      if (claim) await completeCheckpointGeneration(supabase, claim);
      return { inserted: 0, reused: 0, generated: 0, skippedReason: "ready candidates are current" };
    }

    const repositoryRows = await loadRepositoryRows(supabase, curriculumMatches);
    const rankedRows = rankActivityRepositoryRows(repositoryRows, curriculumMatches, sessionContext);
    const reusableByBand = pickReusableActivitiesByBand(rankedRows);
    const parentIdByBand = parentIdsByBand(rankedRows);
    const missingBands = activityBands.filter((band) => !reusableByBand[band]);
    const staticCandidates = createActivityArtifactCandidates({
      lessonState,
      sessionContext,
      curriculumMatches,
    }).map((candidate) => withServerDerivedCandidateFields(candidate, parentIdByBand));

    let openAiCandidates: ActivityArtifactCandidate[] = [];
    if (missingBands.length > 0 && options.openAiGenerator) {
      const generatedCount = await countGeneratedSessionCandidates(supabase, sessionId);
      const maxOpenAiGenerationsPerSession = options.maxOpenAiGenerationsPerSession ?? 3;

      if (generatedCount < maxOpenAiGenerationsPerSession) {
        try {
          const result = await options.openAiGenerator({
            lessonState,
            sessionContext,
            curriculumMatches,
            bands: missingBands,
            parentIdByBand,
          });
          openAiCandidates = result.candidates;
        } catch {
          openAiCandidates = [];
        }
      }
    }

    const planned = planSessionArtifacts({
      reusableByBand,
      openAiCandidates,
      staticCandidates,
    });

    if (planned.length === 0) {
      if (claim) await completeCheckpointGeneration(supabase, claim);
      return { inserted: 0, reused: 0, generated: 0, skippedReason: "no candidates" };
    }

    const candidatesToInsert: SessionCandidateToInsert[] = [];
    for (const artifact of planned) {
      if (artifact.reusable) {
        candidatesToInsert.push({
          sessionId,
          activityId: artifact.reusable.id,
          band: artifact.band,
          sessionContext,
          artifact: artifact.reusable,
          source: artifact.reusable.source === "seeded" ? "seeded" : "reused",
          origin: "repository",
        });
        continue;
      }

      if (!artifact.candidate) continue;
      const persisted = await persistGeneratedArtifact(supabase, artifact.candidate);

      candidatesToInsert.push({
        sessionId,
        activityId: persisted.id,
        band: artifact.band,
        sessionContext,
        artifact: persisted.artifact,
        source: persisted.source,
        origin: artifact.origin ?? "static",
      });
    }

    if (candidatesToInsert.length === 0) {
      if (claim) await completeCheckpointGeneration(supabase, claim);
      return { inserted: 0, reused: 0, generated: 0, skippedReason: "no persisted candidates" };
    }

    await markSessionCandidatesSuperseded(supabase, sessionId);

    for (const candidate of candidatesToInsert) {
      await insertSessionCandidate(supabase, candidate);
    }

    const result = {
      inserted: candidatesToInsert.length,
      reused: candidatesToInsert.filter((candidate) => candidate.source !== "new").length,
      generated: candidatesToInsert.filter((candidate) => candidate.origin === "openai").length,
      skippedReason: null,
    };
    if (claim) await completeCheckpointGeneration(supabase, claim);
    return result;
  } catch (cause) {
    const failedClaim = claim ?? (cause instanceof CheckpointClaimValidationError ? cause.claim : null);
    if (failedClaim) await markCheckpointGenerationFailed(supabase, failedClaim, errorMessage(cause));
    throw cause;
  }
}

async function loadDirectGenerationContext(supabase: SupabaseClient, data: GenerateActivityArtifactsJobData) {
  if (!data.sessionId || !data.lessonState || !data.curriculumMatches) throw new Error("generation requires checkpointId or complete direct input");
  const lessonStates = await loadLessonStates(supabase, data.sessionId, data.lessonState);
  return { sessionId: data.sessionId, lessonState: data.lessonState, curriculumMatches: data.curriculumMatches, sessionContext: buildActivitySessionContext(lessonStates) };
}

async function loadAndClaimCheckpoint(supabase: SupabaseClient, checkpointId: string): Promise<{
  sessionId: string;
  lessonState: LessonState;
  curriculumMatches: CurriculumMatch[];
  sessionContext: SessionContext;
  claim: CheckpointGenerationClaim;
} | null> {
  const generationStartedAt = new Date().toISOString();
  const claim = await supabase.from("checkpoint_generation_outbox").update({ status: "running", generation_started_at: generationStartedAt, last_error: null })
    .eq("checkpoint_id", checkpointId).eq("status", "delivered").select("curriculum_matches, checkpoints(session_id, session_context, segment_ids, latest_lesson_state)").maybeSingle();
  if (claim.error) throw new Error(`generateActivityArtifacts job: failed to claim checkpoint: ${claim.error.message}`);
  if (!claim.data) return null;

  const generationClaim = { checkpointId, generationStartedAt };
  try {
    const checkpoint: any = Array.isArray(claim.data.checkpoints) ? claim.data.checkpoints[0] : claim.data.checkpoints;
    const segmentIds = Array.isArray(checkpoint.segment_ids) ? checkpoint.segment_ids : [];
    if (segmentIds.length === 0) throw new Error("generateActivityArtifacts job: checkpoint has no approved segment range");
    return {
      sessionId: checkpoint.session_id,
      lessonState: lessonStateSchema.parse(checkpoint.latest_lesson_state),
      curriculumMatches: (claim.data.curriculum_matches ?? []) as CurriculumMatch[],
      sessionContext: checkpoint.session_context as SessionContext,
      claim: generationClaim,
    };
  } catch (cause) {
    throw new CheckpointClaimValidationError(generationClaim, cause);
  }
}

async function completeCheckpointGeneration(supabase: SupabaseClient, claim: CheckpointGenerationClaim) {
  const { error } = await supabase
    .from("checkpoint_generation_outbox")
    .update({ status: "completed", generation_completed_at: new Date().toISOString(), last_error: null })
    .eq("checkpoint_id", claim.checkpointId)
    .eq("status", "running")
    .eq("generation_started_at", claim.generationStartedAt);
  if (error) throw new Error(`generateActivityArtifacts job: failed to complete checkpoint: ${error.message}`);
}

async function markCheckpointGenerationFailed(
  supabase: SupabaseClient,
  claim: CheckpointGenerationClaim,
  message: string,
) {
  const { error } = await supabase
    .from("checkpoint_generation_outbox")
    .update({ status: "failed", last_error: message })
    .eq("checkpoint_id", claim.checkpointId)
    .eq("status", "running")
    .eq("generation_started_at", claim.generationStartedAt);
  if (error) throw new Error(`generateActivityArtifacts job: failed to record failure: ${error.message}`);
}

function errorMessage(cause: unknown) {
  return cause instanceof Error ? cause.message : String(cause);
}

export function planSessionArtifacts(input: {
  reusableByBand: Partial<Record<DifficultyBand, RankedActivityRepositoryRow>>;
  openAiCandidates: ActivityArtifactCandidate[];
  staticCandidates: ActivityArtifactCandidate[];
}): PlannedSessionArtifact[] {
  const planned: PlannedSessionArtifact[] = [];

  for (const band of activityBands) {
    const reusable = input.reusableByBand[band];
    if (reusable) {
      planned.push({ band, reusable });
      continue;
    }

    const openAiCandidate = input.openAiCandidates.find(
      (artifact) => artifact.manifest.difficulty_band === band,
    );
    if (openAiCandidate) {
      planned.push({ band, candidate: openAiCandidate, origin: "openai" });
      continue;
    }

    const candidate = input.staticCandidates.find(
      (artifact) => artifact.manifest.difficulty_band === band,
    );

    if (candidate) {
      planned.push({ band, candidate, origin: "static" });
    }
  }

  return planned;
}

async function loadLessonStates(
  supabase: SupabaseClient,
  sessionId: string,
  latestLessonState: LessonState,
): Promise<LessonState[]> {
  const { data, error } = await supabase
    .from("segments")
    .select("lesson_state")
    .eq("session_id", sessionId)
    .order("created_at", { ascending: true });

  if (error) {
    throw new Error(`generateActivityArtifacts job: failed to load segments: ${error.message}`);
  }

  const lessonStates = (data ?? [])
    .map((row) => lessonStateSchema.safeParse(row.lesson_state))
    .filter((result) => result.success)
    .map((result) => result.data);

  if (lessonStates.length === 0) {
    return [latestLessonState];
  }

  return lessonStates;
}

async function loadRepositoryRows(
  supabase: SupabaseClient,
  curriculumMatches: CurriculumMatch[],
): Promise<ActivityRepositoryRow[]> {
  const objectiveCodes = [...new Set(curriculumMatches.map((match) => match.objective_code))];
  if (objectiveCodes.length === 0) return [];

  const { data, error } = await supabase
    .from("activities")
    .select(
      "id, contract_version, manifest, bundle_ref, evidence, parent_id, status, source, verifier_scores, times_used, avg_score",
    )
    .eq("status", "verified")
    .overlaps("curriculum_tags", objectiveCodes)
    .limit(24);

  if (error) {
    throw new Error(`generateActivityArtifacts job: failed to load repository: ${error.message}`);
  }

  return (data ?? []).flatMap((row) => {
    const parsed = parseRepositoryRow(row);
    return parsed ? [parsed] : [];
  });
}

async function hasCurrentReadyCandidates(
  supabase: SupabaseClient,
  sessionId: string,
  nextContext: SessionContext,
): Promise<boolean> {
  const { data, error } = await supabase
    .from("session_activity_candidates")
    .select("difficulty_band, context_snapshot")
    .eq("session_id", sessionId)
    .eq("status", "ready")
    .order("created_at", { ascending: false })
    .limit(3);

  if (error) {
    throw new Error(`generateActivityArtifacts job: failed to load current candidates: ${error.message}`);
  }

  const rows = data ?? [];
  const readyBands = new Set(rows.map((row) => row.difficulty_band));
  if (!activityBands.every((band) => readyBands.has(band))) return false;

  const previousContext = parseSessionContext(rows[0]?.context_snapshot);
  return previousContext ? !hasMaterialContextChange(previousContext, nextContext) : false;
}

async function countGeneratedSessionCandidates(
  supabase: SupabaseClient,
  sessionId: string,
): Promise<number> {
  const { data, error } = await supabase
    .from("session_activity_candidates")
    .select("id, activities!inner(bundle_ref)")
    .eq("session_id", sessionId)
    .eq("source", "new")
    .like("activities.bundle_ref", "artifact-bundles/openai/%");

  if (error) {
    throw new Error(`generateActivityArtifacts job: failed to count generated candidates: ${error.message}`);
  }

  return data?.length ?? 0;
}

function parseSessionContext(value: unknown): SessionContext | null {
  if (!value || typeof value !== "object") return null;
  const context = value as Partial<SessionContext>;

  if (
    typeof context.latest_topic !== "string" ||
    !Array.isArray(context.vocabulary) ||
    typeof context.confidence !== "number" ||
    typeof context.segment_count !== "number"
  ) {
    return null;
  }

  return {
    latest_topic: context.latest_topic,
    latest_objective:
      typeof context.latest_objective === "string" ? context.latest_objective : null,
    vocabulary: context.vocabulary.filter((term): term is string => typeof term === "string"),
    examples_used: Array.isArray(context.examples_used)
      ? context.examples_used.filter((example): example is string => typeof example === "string")
      : [],
    misconceptions: Array.isArray(context.misconceptions)
      ? context.misconceptions.filter((item): item is string => typeof item === "string")
      : [],
    time_remaining_minutes:
      typeof context.time_remaining_minutes === "number" ? context.time_remaining_minutes : null,
    confidence: context.confidence,
    segment_count: context.segment_count,
  };
}

function parentIdsByBand(
  rankedRows: RankedActivityRepositoryRow[],
): Partial<Record<DifficultyBand, string | null>> {
  const parents: Partial<Record<DifficultyBand, string | null>> = {};

  for (const band of activityBands) {
    const nearestParent = rankedRows.find((row) => row.manifest.difficulty_band === band);
    parents[band] = nearestParent && nearestParent.rank_score >= 0.45 ? nearestParent.id : null;
  }

  return parents;
}

function withServerDerivedCandidateFields(
  candidate: ActivityArtifactCandidate,
  parentIdByBand: Partial<Record<DifficultyBand, string | null>>,
): ActivityArtifactCandidate {
  return {
    ...candidate,
    bundle_ref: createUnguessableBundleRef("static"),
    parent_id: parentIdByBand[candidate.manifest.difficulty_band] ?? null,
    status: "candidate",
  };
}

async function markSessionCandidatesSuperseded(supabase: SupabaseClient, sessionId: string) {
  const { error } = await supabase
    .from("session_activity_candidates")
    .update({ status: "superseded" })
    .eq("session_id", sessionId)
    .eq("status", "ready");

  if (error) {
    throw new Error(`generateActivityArtifacts job: failed to supersede candidates: ${error.message}`);
  }
}

async function persistGeneratedArtifact(
  supabase: SupabaseClient,
  candidate: ActivityArtifactCandidate,
): Promise<{
  id: string;
  artifact: ActivityArtifact;
  source: "new";
}> {
  const result = verifyActivityArtifact(candidate);
  if (!result.ok) {
    throw new Error(
      `generateActivityArtifacts job: generated ${candidate.manifest.difficulty_band} artifact failed verification: ${result.errors.join("; ")}`,
    );
  }

  const { error: bundleError } = await supabase.from("activity_bundles").upsert(
    {
      ref: candidate.bundle_ref,
      index_html: candidate.bundle_html,
      checksum: checksum(candidate.bundle_html),
    },
    { onConflict: "ref" },
  );

  if (bundleError) {
    throw new Error(`generateActivityArtifacts job: failed to store bundle: ${bundleError.message}`);
  }

  const { data, error } = await supabase
    .from("activities")
    .upsert(
      {
        contract_version: result.artifact.contract_version,
        manifest: result.artifact.manifest,
        bundle_ref: result.artifact.bundle_ref,
        evidence: result.artifact.evidence,
        parent_id: result.artifact.parent_id,
        status: result.artifact.status,
        source: "new",
        verifier_scores: result.artifact.verifier_scores,
        curriculum_tags: result.artifact.evidence.map((evidence) => evidence.objective_code),
      },
      { onConflict: "bundle_ref" },
    )
    .select("id")
    .single();

  if (error) {
    throw new Error(`generateActivityArtifacts job: failed to store activity: ${error.message}`);
  }

  return {
    id: String(data.id),
    artifact: result.artifact,
    source: "new",
  };
}

async function insertSessionCandidate(
  supabase: SupabaseClient,
  input: SessionCandidateToInsert,
) {
  const { error } = await supabase.from("session_activity_candidates").insert({
    session_id: input.sessionId,
    activity_id: input.activityId,
    difficulty_band: input.band,
    status: "ready",
    source: input.source,
    context_snapshot: input.sessionContext,
    evidence: input.artifact.evidence,
    verifier_scores: input.artifact.verifier_scores,
  });

  if (error) {
    throw new Error(`generateActivityArtifacts job: failed to store session candidate: ${error.message}`);
  }
}

function parseRepositoryRow(row: Record<string, unknown>): ActivityRepositoryRow | null {
  const manifest = activityManifestSchema.safeParse(row.manifest);
  const evidence = activityEvidenceSchema.array().safeParse(row.evidence);
  const verifierScores = activityVerifierScoresSchema.safeParse(row.verifier_scores);

  if (!manifest.success || !evidence.success || !verifierScores.success) return null;
  if (row.contract_version !== "activity-artifact/v1") return null;
  if (row.status !== "verified") return null;

  const source =
    row.source === "seeded" || row.source === "reused" || row.source === "new"
      ? row.source
      : "new";

  return {
    id: String(row.id),
    contract_version: "activity-artifact/v1",
    manifest: manifest.data,
    bundle_ref: String(row.bundle_ref),
    evidence: evidence.data,
    parent_id: typeof row.parent_id === "string" ? row.parent_id : null,
    status: "verified",
    source,
    verifier_scores: verifierScores.data,
    times_used: typeof row.times_used === "number" ? row.times_used : 0,
    avg_score: typeof row.avg_score === "number" ? row.avg_score : null,
  };
}

function checksum(value: string): string {
  let hash = 0x811c9dc5;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }

  return (hash >>> 0).toString(16).padStart(8, "0");
}

function readPositiveIntegerEnv(name: string, fallback: number): number {
  const raw = process.env[name];
  if (!raw) return fallback;

  const parsed = Number.parseInt(raw, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}
