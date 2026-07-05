import type { CurriculumMatch } from "@kobi/curriculum";
import type { ActivityRepositoryRow, DifficultyBand, SessionContext } from "./types.js";

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
        `${row.manifest.title} ${row.manifest.content.items.map((item) => item.prompt).join(" ")}`,
        [context.latest_topic, context.latest_objective ?? "", ...context.vocabulary].join(" "),
      );

      return {
        ...row,
        rank_score:
          objectiveMatch * 0.4 +
          topicScore * 0.2 +
          verifierScore * 0.2 +
          usageScore * 0.1 +
          outcomeScore * 0.1,
      };
    })
    .sort((left, right) => right.rank_score - left.rank_score);
}

export function pickReusableActivitiesByBand(
  rows: RankedActivityRepositoryRow[],
  minimumScore = 0.72,
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
