import { describe, expect, it } from "vitest";
import {
  ACTIVITY_ARTIFACT_CONTRACT_VERSION,
  ACTIVITY_SDK_VERSION,
  type DifficultyBand,
  type RankedActivityRepositoryRow,
} from "./server.js";
import { pickLegacyActivitySet } from "./repository.js";

describe("legacy activity repository reuse", () => {
  it("selects a complete strong legacy trio for one exact curriculum target", () => {
    const rows = [
      repositoryRow("support", 0.91),
      repositoryRow("core", 0.89),
      repositoryRow("challenge", 0.87),
    ];

    expect(pickLegacyActivitySet(rows).map((row) => row.manifest.difficulty_band)).toEqual([
      "support",
      "core",
      "challenge",
    ]);
  });

  it("does not combine legacy bands from different curriculum targets", () => {
    const rows = [
      repositoryRow("support", 0.91),
      repositoryRow("core", 0.89),
      repositoryRow("challenge", 0.9, "L7.4.3"),
    ];

    expect(pickLegacyActivitySet(rows)).toEqual([]);
  });

  it("does not treat named-set rows as legacy fallback rows", () => {
    const rows = [
      { ...repositoryRow("support", 0.91), activity_set_id: "set-a" },
      { ...repositoryRow("core", 0.89), activity_set_id: "set-a" },
      { ...repositoryRow("challenge", 0.87), activity_set_id: "set-a" },
    ];

    expect(pickLegacyActivitySet(rows)).toEqual([]);
  });
});

function repositoryRow(
  band: DifficultyBand,
  rankScore: number,
  objective = "L7.4.2",
): RankedActivityRepositoryRow {
  return {
    id: `legacy-${objective}-${band}`,
    contract_version: ACTIVITY_ARTIFACT_CONTRACT_VERSION,
    manifest: {
      family:
        band === "support"
          ? "match_classify"
          : band === "challenge"
            ? "sequence_order"
            : "guided_practice",
      title: `Legacy ${band}`,
      difficulty_band: band,
      curriculum: { grade: 7, subject: "lenguaje", unit: "U4", objective },
      est_minutes: 6,
      content: {
        items: [{ prompt: "Responde sobre la noticia.", answer_key: ["titular"], hints: [] }],
      },
      entry: "index.html",
      sdk_version: ACTIVITY_SDK_VERSION,
      allowed_capabilities: ["dom", "css"],
    },
    bundle_ref: `artifact-bundles/legacy-${objective}-${band}/index.html`,
    evidence: [{ objective_code: objective, section: `U4 / ${objective}`, text: "La noticia" }],
    parent_id: null,
    activity_set_id: null,
    status: "verified",
    source: "seeded",
    verifier_scores: {
      deterministic: "pass",
      rubric: {
        curriculum_alignment: 0.95,
        age_fit: 0.9,
        duration_fit: 0.9,
        answer_correctness: 0.9,
        hint_leakage: 0.9,
        duplicate_risk: 0.8,
        spanish_suitability: 0.95,
      },
    },
    times_used: 1,
    avg_score: 0.8,
    rank_score: rankScore,
  };
}
