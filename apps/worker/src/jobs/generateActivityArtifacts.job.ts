import type { SupabaseClient } from "@supabase/supabase-js";
import {
  activityEvidenceSchema,
  activityManifestSchema,
  activityVerifierScoresSchema,
  buildActivitySessionContext,
  createActivityArtifactCandidates,
  pickReusableActivitiesByBand,
  rankActivityRepositoryRows,
  verifyActivityArtifact,
  type ActivityArtifact,
  type ActivityArtifactCandidate,
  type ActivityRepositoryRow,
  type ActivitySource,
  type DifficultyBand,
  type SessionContext,
} from "@kobi/activities";
import { lessonStateSchema, type LessonState } from "@kobi/ai-core";
import type { CurriculumMatch } from "@kobi/curriculum";
import type PgBoss from "pg-boss";

export interface GenerateActivityArtifactsJobData {
  sessionId: string;
  lessonState: LessonState;
  curriculumMatches: CurriculumMatch[];
}

const activityBands: DifficultyBand[] = ["support", "core", "challenge"];

interface SessionCandidateToInsert {
  sessionId: string;
  activityId: string;
  band: DifficultyBand;
  sessionContext: SessionContext;
  artifact: ActivityArtifact | ActivityRepositoryRow;
  source: ActivitySource;
}

export function registerGenerateActivityArtifactsJob(boss: PgBoss, supabase: SupabaseClient) {
  return boss.work<GenerateActivityArtifactsJobData>(
    "generate-activity-artifacts",
    { batchSize: 1 },
    async (jobs) => {
      const job = jobs[0];
      if (!job) return;

      const { sessionId, lessonState, curriculumMatches } = job.data;
      if (curriculumMatches.length === 0) return;

      const lessonStates = await loadLessonStates(supabase, sessionId, lessonState);
      const sessionContext = buildActivitySessionContext(lessonStates);

      const repositoryRows = await loadRepositoryRows(supabase, curriculumMatches);
      const rankedRows = rankActivityRepositoryRows(repositoryRows, curriculumMatches, sessionContext);
      const reusableByBand = pickReusableActivitiesByBand(rankedRows);
      const generatedCandidates = createActivityArtifactCandidates({
        lessonState,
        sessionContext,
        curriculumMatches,
      });
      const candidatesToInsert: SessionCandidateToInsert[] = [];

      for (const band of activityBands) {
        const reusable = reusableByBand[band];
        if (reusable) {
          candidatesToInsert.push({
            sessionId,
            activityId: reusable.id,
            band,
            sessionContext,
            artifact: reusable,
            source: reusable.source === "seeded" ? "seeded" : "reused",
          });
          continue;
        }

        const candidate = generatedCandidates.find(
          (artifact) => artifact.manifest.difficulty_band === band,
        );
        if (!candidate) continue;

        const nearestParent = rankedRows.find((row) => row.manifest.difficulty_band === band);
        const candidateWithParent: ActivityArtifactCandidate = {
          ...candidate,
          parent_id: nearestParent && nearestParent.rank_score >= 0.45 ? nearestParent.id : null,
        };
        const persisted = await persistGeneratedArtifact(supabase, candidateWithParent);

        candidatesToInsert.push({
          sessionId,
          activityId: persisted.id,
          band,
          sessionContext,
          artifact: persisted.artifact,
          source: persisted.source,
        });
      }

      if (candidatesToInsert.length === 0) return;

      await markSessionCandidatesSuperseded(supabase, sessionId);

      for (const candidate of candidatesToInsert) {
        await insertSessionCandidate(supabase, candidate);
      }
    },
  );
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
