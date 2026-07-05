import type { DifficultyBand } from "./types.js";

export interface ApprovedBandActivity {
  difficulty_band: DifficultyBand;
  activity_id: string;
  approved: boolean;
}

export function resolveApprovedActivityForBand(
  approvals: ApprovedBandActivity[],
  studentBand: DifficultyBand | string | null | undefined,
): ApprovedBandActivity | null {
  const requestedBand = normalizeDifficultyBand(studentBand);
  const approvedByBand = new Map(
    approvals
      .filter((approval) => approval.approved)
      .map((approval) => [approval.difficulty_band, approval] as const),
  );

  return approvedByBand.get(requestedBand) ?? approvedByBand.get("core") ?? null;
}

export function normalizeDifficultyBand(value: string | null | undefined): DifficultyBand {
  return value === "support" || value === "challenge" || value === "core" ? value : "core";
}
