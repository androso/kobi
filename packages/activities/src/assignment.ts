import type { DifficultyBand } from "./types.js";

export interface ApprovedBandActivity {
  difficulty_band: DifficultyBand;
  activity_id: string;
  candidate_id: string | null;
  approved: boolean;
}

export function resolveApprovedActivityForBand(
  approvals: ApprovedBandActivity[],
  requestedBand: DifficultyBand | string | null | undefined,
): ApprovedBandActivity | null {
  const band = normalizeDifficultyBand(requestedBand);
  const approvedByBand = new Map(
    approvals
      .filter((approval) => approval.approved)
      .map((approval) => [approval.difficulty_band, approval] as const),
  );

  return approvedByBand.get(band) ?? approvedByBand.get("core") ?? null;
}

export function normalizeDifficultyBand(value: string | null | undefined): DifficultyBand {
  return value === "support" || value === "challenge" || value === "core" ? value : "core";
}
