import type { DifficultyBand } from "./types.js";

export interface ApprovedBandActivity {
  difficulty_band: DifficultyBand;
  activity_id: string;
  approved: boolean;
}

export function resolveApprovedActivityForBand(
  approvals: ApprovedBandActivity[],
  studentBand: DifficultyBand | null | undefined,
): ApprovedBandActivity | null {
  const requestedBand = studentBand ?? "core";
  const approvedByBand = new Map(
    approvals
      .filter((approval) => approval.approved)
      .map((approval) => [approval.difficulty_band, approval] as const),
  );

  return approvedByBand.get(requestedBand) ?? approvedByBand.get("core") ?? null;
}
