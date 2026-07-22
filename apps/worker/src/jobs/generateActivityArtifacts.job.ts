import type { SupabaseClient } from "@supabase/supabase-js";
import {
  activityEvidenceSchema,
  activityManifestSchema,
  activityVerifierScoresSchema,
  buildActivitySessionContext,
  createAdaptedGamePlan,
  createActivityArtifactCandidates,
  createUnguessableBundleRef,
  createGamePlan,
  hasMaterialContextChange,
  pickAdaptationSource,
  pickCoherentActivitySet,
  pickLegacyActivitySet,
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
import {
  buildCurriculumQueryText,
  retrieveCurriculumMatches,
  type CurriculumMatch,
} from "@kobi/curriculum";
import type PgBoss from "pg-boss";
import {
  createOpenAiActivityGeneratorFromEnv,
  createActivitySetId,
  type GenerateOpenAiActivityCandidatesInput,
  type OpenAiActivityGenerationResult,
} from "../activity-generation/openaiArtifactGenerator.js";


export interface GenerateActivityArtifactsJobData {
  sessionId: string;
  lessonState: LessonState;
  curriculumMatches: CurriculumMatch[];
  curriculumFallback?: {
    classId?: string;
    grade: number;
    subject: string;
    unit?: string;
    sourceIds?: string[];
  };
}

const activityBands: DifficultyBand[] = ["support", "core", "challenge"];

export type OpenAiActivityCandidateGenerator = (
  input: GenerateOpenAiActivityCandidatesInput,
) => Promise<OpenAiActivityGenerationResult>;

export interface GenerateActivityArtifactsJobOptions {
  openAiGenerator?: OpenAiActivityCandidateGenerator | null;
  maxOpenAiGenerationsPerSession?: number;
  curriculumRetriever?: CurriculumRetriever;
}

export type CurriculumRetriever = (
  supabase: SupabaseClient,
  input: { queryText: string; grade: number; subject: string; unit?: string; sourceIds?: string[] },
) => Promise<CurriculumMatch[]>;

export interface GenerateActivityArtifactsJobResult {
  inserted: number;
  reused: number;
  generated: number;
  skippedReason: string | null;
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

      const startedAt = Date.now();
      console.info("[activityGenerator] queued job started", {
        sessionId: job.data.sessionId,
        jobId: job.id,
      });
      try {
        const currentData = await refreshGenerateActivityArtifactsJobData(
          supabase,
          job.data,
          options.curriculumRetriever,
        );
        const result = await runGenerateActivityArtifactsJob(supabase, currentData, {
          openAiGenerator,
          maxOpenAiGenerationsPerSession,
        });
        console.info("[activityGenerator] queued job finished", {
          sessionId: job.data.sessionId,
          jobId: job.id,
          durationMs: Date.now() - startedAt,
          ...result,
        });
      } catch (error) {
        console.error("[activityGenerator] queued job failed", {
          sessionId: job.data.sessionId,
          jobId: job.id,
          durationMs: Date.now() - startedAt,
          error: error instanceof Error ? error.stack ?? error.message : error,
        });
        throw error;
      }
    },
  );
}

/**
 * Queue singleton policies serialize jobs but do not replace an older created
 * job. Refresh the lesson and curriculum at execution time so a delayed job
 * cannot publish candidates for a stale checkpoint payload.
 */
export async function refreshGenerateActivityArtifactsJobData(
  supabase: SupabaseClient,
  data: GenerateActivityArtifactsJobData,
  curriculumRetriever: CurriculumRetriever = retrieveCurriculumMatches,
): Promise<GenerateActivityArtifactsJobData> {
  const lessonStates = await loadLessonStates(supabase, data.sessionId, data.lessonState);
  const lessonState = lessonStates.at(-1) ?? data.lessonState;
  const retrievalContext = data.curriculumFallback ?? contextFromCurriculumMatches(data.curriculumMatches);

  if (!retrievalContext) {
    return { ...data, lessonState };
  }

  const curriculumMatches = await curriculumRetriever(supabase, {
    queryText: buildCurriculumQueryText(lessonState),
    grade: retrievalContext.grade,
    subject: retrievalContext.subject,
    unit: retrievalContext.unit,
    sourceIds: retrievalContext.sourceIds,
  });

  return { ...data, lessonState, curriculumMatches };
}

function contextFromCurriculumMatches(
  matches: CurriculumMatch[],
): GenerateActivityArtifactsJobData["curriculumFallback"] | undefined {
  const first = matches[0];
  return first
    ? { grade: first.grade, subject: first.subject, unit: first.unit }
    : undefined;
}

export async function runGenerateActivityArtifactsJob(
  supabase: SupabaseClient,
  data: GenerateActivityArtifactsJobData,
  options: GenerateActivityArtifactsJobOptions = {},
): Promise<GenerateActivityArtifactsJobResult> {
  const { sessionId, lessonState } = data;
  const curriculumMatches =
    data.curriculumMatches.length > 0
      ? data.curriculumMatches
      : data.curriculumFallback
        ? [buildFallbackCurriculumMatch(lessonState, data.curriculumFallback)]
        : [];
  console.info("[activityGenerator] planning candidates", {
    sessionId,
    curriculumMatchCount: curriculumMatches.length,
    usingLessonStateFallback: data.curriculumMatches.length === 0 && curriculumMatches.length > 0,
  });
  if (curriculumMatches.length === 0) {
    console.warn("[activityGenerator] skipped because no curriculum matches were found", { sessionId });
    return { inserted: 0, reused: 0, generated: 0, skippedReason: "no curriculum matches" };
  }

  const lessonStates = await loadLessonStates(supabase, sessionId, lessonState);
  const sessionContext = buildActivitySessionContext(lessonStates);

  if (await hasCurrentReadyCandidates(supabase, sessionId, sessionContext)) {
    console.info("[activityGenerator] current candidates already exist", { sessionId });
    return { inserted: 0, reused: 0, generated: 0, skippedReason: "ready candidates are current" };
  }

  const repositoryRows = await loadRepositoryRows(supabase, curriculumMatches);
  const rankedRows = rankActivityRepositoryRows(repositoryRows, curriculumMatches, sessionContext);
  const coherentSet = pickCoherentActivitySet(rankedRows);
  const legacySet = coherentSet.length === 0 ? pickLegacyActivitySet(rankedRows) : [];
  const reusableSet = coherentSet.length === 3 ? coherentSet : legacySet;
  const adaptationSource = reusableSet.length === 0 ? pickAdaptationSource(rankedRows) : [];
  const adapting = adaptationSource.length > 0;
  const parentIdByBand = adapting ? parentIdsByBand(adaptationSource) : {};
  const missingBands = reusableSet.length === 3 ? [] : activityBands;
  const activitySetId = createActivitySetId();
  const gamePlan = adapting
    ? createAdaptedGamePlan(sessionContext, curriculumMatches, adaptationSource[0].manifest)
    : createGamePlan(sessionContext, curriculumMatches);
  const generatedSource: "adapted" | "new" = adapting ? "adapted" : "new";
  const staticCandidates = createActivityArtifactCandidates({
    lessonState,
    sessionContext,
    curriculumMatches,
    activitySetId,
    gamePlan,
  }).map((candidate) => withServerDerivedCandidateFields(candidate, parentIdByBand));

  let openAiCandidates: ActivityArtifactCandidate[] = [];
  if (missingBands.length > 0 && options.openAiGenerator) {
    const maxOpenAiGenerationsPerSession = options.maxOpenAiGenerationsPerSession ?? 3;
    const generationAttemptClaimed = await claimOpenAiGenerationAttempt(
      supabase,
      sessionId,
      activitySetId,
      maxOpenAiGenerationsPerSession,
    );

    if (generationAttemptClaimed) {
      try {
        console.info("[activityGenerator] requesting OpenAI candidates", {
          sessionId,
          bands: missingBands,
          generationLimit: maxOpenAiGenerationsPerSession,
        });
        const result = await options.openAiGenerator({
          lessonState,
          sessionContext,
          curriculumMatches,
          bands: missingBands,
          parentIdByBand,
          activitySetId,
          gamePlan,
        });
        openAiCandidates = result.candidates;
        console.info("[activityGenerator] OpenAI candidates received", {
          sessionId,
          candidateCount: openAiCandidates.length,
          errors: result.errors.length > 0 ? result.errors : undefined,
        });
      } catch (error) {
        console.error("[activityGenerator] OpenAI generation failed; using static candidates", {
          sessionId,
          bands: missingBands,
          error: error instanceof Error ? error.stack ?? error.message : error,
        });
        openAiCandidates = [];
      }
    }
  }

  const planned = planSessionArtifacts({
    reusableSet,
    openAiCandidates,
    staticCandidates,
  });

  if (planned.length === 0) {
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
    const persisted = await persistGeneratedArtifact(supabase, artifact.candidate, generatedSource);

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
    return { inserted: 0, reused: 0, generated: 0, skippedReason: "no persisted candidates" };
  }

  await replaceSessionCandidates(supabase, sessionId, candidatesToInsert);

  const result = {
    inserted: candidatesToInsert.length,
    reused: candidatesToInsert.filter((candidate) => candidate.source !== "new").length,
    generated: candidatesToInsert.filter((candidate) => candidate.origin === "openai").length,
    skippedReason: null,
  };
  console.info("[activityGenerator] candidates persisted", { sessionId, ...result });
  return result;
}

function buildFallbackCurriculumMatch(
  lessonState: LessonState,
  context: NonNullable<GenerateActivityArtifactsJobData["curriculumFallback"]>,
): CurriculumMatch {
  return {
    objective_code: "UNMAPPED_LESSON_STATE",
    unit: context.unit ?? "unmapped",
    grade: context.grade,
    subject: context.subject,
    text: [
      "No curriculum objective matched this lesson.",
      `Live lesson topic: ${lessonState.topic}.`,
      lessonState.objective_guess ? `Inferred objective: ${lessonState.objective_guess}.` : null,
      `Lesson summary: ${lessonState.transcript_summary}`,
    ]
      .filter(Boolean)
      .join(" "),
    similarity: 0,
  };
}

export function planSessionArtifacts(input: {
  reusableSet: RankedActivityRepositoryRow[];
  openAiCandidates: ActivityArtifactCandidate[];
  staticCandidates: ActivityArtifactCandidate[];
}): PlannedSessionArtifact[] {
  const reusable = completeRepositorySet(input.reusableSet);
  if (reusable) {
    return activityBands.map((band) => ({ band, reusable: reusable.get(band) }));
  }

  const openAi = completeCandidateSet(input.openAiCandidates);
  if (openAi) {
    return activityBands.map((band) => ({ band, candidate: openAi.get(band), origin: "openai" }));
  }

  const fallback = completeCandidateSet(input.staticCandidates);
  return fallback
    ? activityBands.map((band) => ({ band, candidate: fallback.get(band), origin: "static" }))
    : [];
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
      "id, contract_version, manifest, bundle_ref, evidence, parent_id, activity_set_id, status, source, verifier_scores, times_used, avg_score",
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

async function claimOpenAiGenerationAttempt(
  supabase: SupabaseClient,
  sessionId: string,
  activitySetId: string,
  limit: number,
): Promise<boolean> {
  const { data, error } = await supabase.rpc("claim_openai_activity_generation_attempt", {
    input_session_id: sessionId,
    input_activity_set_id: activitySetId,
    input_limit: limit,
  });

  if (error) {
    throw new Error(`generateActivityArtifacts job: failed to claim OpenAI attempt: ${error.message}`);
  }

  return data === true;
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
  const fallbackParent = rankedRows[0]?.id ?? null;

  for (const band of activityBands) {
    const nearestParent = rankedRows.find((row) => row.manifest.difficulty_band === band);
    parents[band] = nearestParent?.id ?? fallbackParent;
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
    activity_set_id: candidate.activity_set_id ?? `set-${createUnguessableBundleRef("static").split("/")[1]}`,
    status: "candidate",
  };
}

async function persistGeneratedArtifact(
  supabase: SupabaseClient,
  candidate: ActivityArtifactCandidate,
  source: "adapted" | "new",
): Promise<{
  id: string;
  artifact: ActivityArtifact;
  source: "adapted" | "new";
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
        activity_set_id: result.artifact.activity_set_id,
        status: result.artifact.status,
        source,
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
    source,
  };
}

function completeRepositorySet(
  rows: RankedActivityRepositoryRow[],
): Map<DifficultyBand, RankedActivityRepositoryRow> | null {
  if (rows.length === 0) return null;
  const activitySetIds = rows.map((row) => row.activity_set_id);
  const namedSetIds = activitySetIds.filter((activitySetId): activitySetId is string => Boolean(activitySetId));
  const isNamedSet = namedSetIds.length === rows.length && new Set(namedSetIds).size === 1;
  const isLegacySet = namedSetIds.length === 0 && new Set(rows.map(repositoryLegacyCoherenceKey)).size === 1;
  if (!isNamedSet && !isLegacySet) return null;

  const byBand = new Map(rows.map((row) => [row.manifest.difficulty_band, row] as const));
  return activityBands.every((band) => byBand.has(band)) ? byBand : null;
}

function repositoryLegacyCoherenceKey(row: RankedActivityRepositoryRow): string {
  const { grade, subject, unit, objective } = row.manifest.curriculum;
  return JSON.stringify([
    grade,
    subject,
    unit,
    objective,
    row.manifest.family,
    row.manifest.mechanic ?? null,
  ]);
}

function completeCandidateSet(
  candidates: ActivityArtifactCandidate[],
): Map<DifficultyBand, ActivityArtifactCandidate> | null {
  if (candidates.length === 0) return null;
  const activitySetIds = candidates.map((candidate) => candidate.activity_set_id);
  if (activitySetIds.some((activitySetId) => !activitySetId)) return null;
  const setIds = new Set(activitySetIds);
  if (setIds.size !== 1) return null;

  const byBand = new Map(
    candidates.map((candidate) => [candidate.manifest.difficulty_band, candidate] as const),
  );
  return activityBands.every((band) => byBand.has(band)) ? byBand : null;
}

async function replaceSessionCandidates(
  supabase: SupabaseClient,
  sessionId: string,
  candidates: SessionCandidateToInsert[],
) {
  const { error } = await supabase.rpc("replace_session_activity_candidates", {
    input_session_id: sessionId,
    input_candidates: candidates.map((candidate) => ({
      activity_id: candidate.activityId,
      difficulty_band: candidate.band,
      source: candidate.source,
      context_snapshot: candidate.sessionContext,
      evidence: candidate.artifact.evidence,
      verifier_scores: candidate.artifact.verifier_scores,
    })),
  });

  if (error) {
    throw new Error(`generateActivityArtifacts job: failed to replace session candidates: ${error.message}`);
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
    row.source === "seeded" || row.source === "reused" || row.source === "adapted" || row.source === "new"
      ? row.source
      : "new";

  return {
    id: String(row.id),
    contract_version: "activity-artifact/v1",
    manifest: manifest.data,
    bundle_ref: String(row.bundle_ref),
    evidence: evidence.data,
    parent_id: typeof row.parent_id === "string" ? row.parent_id : null,
    activity_set_id: typeof row.activity_set_id === "string" ? row.activity_set_id : null,
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
