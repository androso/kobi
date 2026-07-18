import type { CurriculumMatch } from "@kobi/curriculum";
import type { ActivityRepositoryRow, DifficultyBand, SessionContext } from "./types.js";

export const STRONG_REUSE_THRESHOLD = 0.78;
export const ADAPTATION_THRESHOLD = 0.55;

export interface RankedActivityRepositoryRow extends ActivityRepositoryRow {
  rank_score: number;
}

export function rankActivityRepositoryRows(
  rows: ActivityRepositoryRow[],
  curriculumMatches: CurriculumMatch[],
  context: SessionContext,
): RankedActivityRepositoryRow[] {
  const objectiveScores = new Map(
    curriculumMatches.map((match) => [match.objective_code, match.similarity] as const),
  );

  return rows
    .filter((row) => row.status === "verified")
    .map((row) => {
      const objective = row.manifest.curriculum.objective;
      const objectiveMatch = objectiveScores.get(objective) ?? 0;
      const verifierScore = row.verifier_scores.rubric.curriculum_alignment;
      const usageScore = Math.min(row.times_used / 10, 1);
      const outcomeScore = row.avg_score ?? 0.5;
      const topicScore = textOverlapScore(
        activitySearchText(row),
        [context.latest_topic, context.latest_objective ?? "", ...context.vocabulary].join(" "),
      );

      return {
        ...row,
        rank_score:
          objectiveMatch * 0.4 +
          topicScore * 0.2 +
          verifierScore * 0.15 +
          usageScore * 0.1 +
          outcomeScore * 0.15,
      };
    })
    .sort((left, right) => right.rank_score - left.rank_score);
}

export function pickReusableActivitiesByBand(
  rows: RankedActivityRepositoryRow[],
  minimumScore = STRONG_REUSE_THRESHOLD,
): Partial<Record<DifficultyBand, RankedActivityRepositoryRow>> {
  const picked: Partial<Record<DifficultyBand, RankedActivityRepositoryRow>> = {};

  for (const row of rows) {
    if (row.rank_score < minimumScore) continue;
    const band = row.manifest.difficulty_band;
    if (!picked[band]) {
      picked[band] = row;
    }
  }

  return picked;
}

export function pickCoherentActivitySet(
  rows: RankedActivityRepositoryRow[],
  minimumScore = STRONG_REUSE_THRESHOLD,
): RankedActivityRepositoryRow[] {
  const sets = new Map<string, RankedActivityRepositoryRow[]>();
  for (const row of rows) {
    if (!row.activity_set_id || row.rank_score < minimumScore) continue;
    const current = sets.get(row.activity_set_id) ?? [];
    current.push(row);
    sets.set(row.activity_set_id, current);
  }

  return [...sets.values()]
    .map(bestRowPerBand)
    .filter((set) => set.length === 3)
    .sort((left, right) => averageRank(right) - averageRank(left))[0] ?? [];
}

export function pickLegacyActivitySet(
  rows: RankedActivityRepositoryRow[],
  minimumScore = STRONG_REUSE_THRESHOLD,
): RankedActivityRepositoryRow[] {
  const setsByCurriculum = new Map<string, RankedActivityRepositoryRow[]>();

  for (const row of rows) {
    if (row.activity_set_id || row.rank_score < minimumScore) continue;
    const key = legacyCoherenceKey(row);
    const current = setsByCurriculum.get(key) ?? [];
    current.push(row);
    setsByCurriculum.set(key, current);
  }

  return [...setsByCurriculum.values()]
    .map(bestRowPerBand)
    .filter((set) => set.length === 3)
    .sort((left, right) => averageRank(right) - averageRank(left))[0] ?? [];
}

export function pickAdaptationSource(
  rows: RankedActivityRepositoryRow[],
): RankedActivityRepositoryRow[] {
  const best = rows.find(
    (row) =>
      row.manifest.mechanic &&
      row.rank_score >= ADAPTATION_THRESHOLD &&
      row.rank_score < STRONG_REUSE_THRESHOLD,
  );
  if (!best) return [];

  if (!best.activity_set_id) return [best];
  return rows.filter((row) => row.activity_set_id === best.activity_set_id);
}

function averageRank(rows: RankedActivityRepositoryRow[]): number {
  return rows.reduce((sum, row) => sum + row.rank_score, 0) / Math.max(rows.length, 1);
}

function bestRowPerBand(rows: RankedActivityRepositoryRow[]): RankedActivityRepositoryRow[] {
  const picked = new Map<DifficultyBand, RankedActivityRepositoryRow>();
  for (const row of rows) {
    const band = row.manifest.difficulty_band;
    const current = picked.get(band);
    if (!current || row.rank_score > current.rank_score) picked.set(band, row);
  }
  return (["support", "core", "challenge"] as DifficultyBand[]).flatMap((band) => {
    const row = picked.get(band);
    return row ? [row] : [];
  });
}

function legacyCoherenceKey(row: ActivityRepositoryRow): string {
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

function activitySearchText(row: ActivityRepositoryRow): string {
  return [
    row.manifest.title,
    row.manifest.mechanic ?? "",
    row.manifest.learning_design?.learning_goal ?? "",
    row.manifest.learning_design?.interaction_summary ?? "",
    ...row.manifest.content.items.map((item) => item.prompt),
    ...row.manifest.content.items.flatMap((item) => item.answer_key),
    ...row.manifest.content.items.flatMap((item) => item.hints),
  ].join(" ");
}

function textOverlapScore(left: string, right: string): number {
  const leftTokens = tokenize(left);
  const rightTokens = tokenize(right);
  if (leftTokens.size === 0 || rightTokens.size === 0) return 0;

  let overlap = 0;
  for (const token of leftTokens) {
    if (rightTokens.has(token)) overlap += 1;
  }

  return overlap / Math.max(leftTokens.size, rightTokens.size);
}

function tokenize(value: string): Set<string> {
  return new Set(
    value
      .toLocaleLowerCase("es-SV")
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .split(/[^a-z0-9ñ]+/i)
      .filter((token) => token.length > 3),
  );
}
