import { describe, expect, it } from "vitest";
import {
  ACTIVITY_ARTIFACT_CONTRACT_VERSION,
  ACTIVITY_SDK_VERSION,
  type ActivityArtifactCandidate,
  type ActivityManifest,
  type RankedActivityRepositoryRow,
} from "@kobi/activities";
import { planSessionArtifacts } from "./generateActivityArtifacts.job.js";

describe("generateActivityArtifacts job planning", () => {
  it("uses reusable activities first, OpenAI candidates for missing bands, then static fallback", () => {
    const reusableSupport = repositoryRow("support", 0.92);
    const openAiCore = candidate("core", "openai-core");
    const staticCore = candidate("core", "static-core");
    const staticChallenge = candidate("challenge", "static-challenge");

    const planned = planSessionArtifacts({
      reusableByBand: { support: reusableSupport },
      openAiCandidates: [openAiCore],
      staticCandidates: [staticCore, staticChallenge],
    });

    expect(planned).toHaveLength(3);
    expect(planned[0].reusable?.id).toBe("activity-support");
    expect(planned[1].candidate?.bundle_ref).toBe("artifact-bundles/openai-core/index.html");
    expect(planned[2].candidate?.bundle_ref).toBe("artifact-bundles/static-challenge/index.html");
  });
});

function repositoryRow(
  band: "support" | "core" | "challenge",
  rankScore: number,
): RankedActivityRepositoryRow {
  return {
    id: `activity-${band}`,
    contract_version: ACTIVITY_ARTIFACT_CONTRACT_VERSION,
    manifest: manifest(band, `Reusable ${band}`),
    bundle_ref: `artifact-bundles/reusable-${band}/index.html`,
    evidence: [{ objective_code: "L7.4.2", section: "U4 / L7.4.2", text: "La noticia" }],
    parent_id: null,
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

function candidate(
  band: "support" | "core" | "challenge",
  refPart: string,
): ActivityArtifactCandidate {
  return {
    contract_version: ACTIVITY_ARTIFACT_CONTRACT_VERSION,
    manifest: manifest(band, `Candidate ${band}`),
    bundle_ref: `artifact-bundles/${refPart}/index.html`,
    bundle_html: "<!doctype html><html><script>activity-sdk/v1 postMessage getManifest getBand reportAttempt reportHint reportComplete</script><body>Candidate</body></html>",
    verifier_scores: {
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
    },
    evidence: [{ objective_code: "L7.4.2", section: "U4 / L7.4.2", text: "La noticia" }],
    parent_id: null,
    status: "candidate",
  };
}

function manifest(band: "support" | "core" | "challenge", title: string): ActivityManifest {
  return {
    family: "guided_practice" as const,
    title,
    difficulty_band: band,
    curriculum: {
      grade: 7,
      subject: "lenguaje",
      unit: "U4",
      objective: "L7.4.2",
    },
    est_minutes: 6,
    content: {
      items: [
        {
          prompt: "Responde sobre la noticia.",
          answer_key: ["titular"],
          hints: ["Busca la idea principal."],
        },
      ],
    },
    entry: "index.html" as const,
    sdk_version: ACTIVITY_SDK_VERSION,
    allowed_capabilities: ["dom", "css"],
  };
}
