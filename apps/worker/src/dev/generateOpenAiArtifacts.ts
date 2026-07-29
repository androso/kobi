import { mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { buildActivitySessionContext, verifyActivityArtifact } from "@kobi/activities/server";
import { loadRootEnv } from "@kobi/db";
import {
  createOpenAiActivityDraftClient,
  createActivitySetId,
  generateOpenAiActivityCandidates,
} from "../activity-generation/openaiArtifactGenerator.js";
import { staticActivityContext } from "./staticActivityContext.js";
import { createActivityRuntimeVerifierFromEnv } from "../activity-generation/runtimeVerifierFactory.js";

logStep("Loading .env files");
loadLocalEnv();

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});

async function main() {
  const apiKey = process.env.OPENAI_API_KEY?.trim();
  const model = process.env.OPENAI_ACTIVITY_MODEL?.trim() || "gpt-5.5";

  if (!apiKey) {
    throw new Error("OPENAI_API_KEY is required. Put it in .env or export it before running this script.");
  }
  logStep(`Using OpenAI activity model: ${model}`);

  logStep("Building static lesson/session context");
  const sessionContext = buildActivitySessionContext([staticActivityContext.lessonState]);
  const outputDir = resolve(
    "/tmp",
    "kobi-artifacts",
    `${new Date().toISOString().replace(/[:.]/g, "-")}-${staticActivityContext.sessionId}`,
  );
  logStep(`Output directory: ${outputDir}`);

  const runtimeVerifier = createActivityRuntimeVerifierFromEnv();
  logStep(`Calling OpenAI and verifying artifacts with ${runtimeVerifier.backend}`);
  const result = await generateOpenAiActivityCandidates(
    {
      lessonState: staticActivityContext.lessonState,
      sessionContext,
      curriculumMatches: staticActivityContext.curriculumMatches,
      bands: ["support", "core", "challenge"],
      activitySetId: createActivitySetId(),
    },
    {
      client: createOpenAiActivityDraftClient(apiKey),
      model,
      runtimeVerifier: runtimeVerifier.verifier,
    },
  );
  logStep(`OpenAI generation finished after ${result.attempts} attempt(s)`);

  if (result.errors.length > 0) {
    logStep(`Generator/verifier reported ${result.errors.length} recoverable error(s)`);
    for (const error of result.errors) {
      console.warn(`  - ${error}`);
    }
  }

  logStep(`Preparing to write ${result.candidates.length} verified candidate(s)`);

  await mkdir(outputDir, { recursive: true });

  const summary = {
    output_dir: outputDir,
    model,
    attempts: result.attempts,
    generator_errors: result.errors,
    artifacts: [] as Array<{
      band: string;
      title: string;
      ok: boolean;
      errors: string[];
      html_path: string;
      manifest_path: string;
      evidence: string[];
    }>,
  };

  for (const candidate of result.candidates) {
    logStep(`Verifying ${candidate.manifest.difficulty_band} artifact: ${candidate.manifest.title}`);
    const verified = verifyActivityArtifact(candidate);
    const band = candidate.manifest.difficulty_band;
    const bandDir = resolve(outputDir, band);
    const htmlPath = resolve(bandDir, "index.html");
    const manifestPath = resolve(bandDir, "manifest.json");

    await mkdir(bandDir, { recursive: true });
    await writeFile(htmlPath, candidate.bundle_html, "utf8");
    await writeFile(
      manifestPath,
      JSON.stringify(
        {
          contract_version: candidate.contract_version,
          manifest: candidate.manifest,
          bundle_ref: candidate.bundle_ref,
          verifier_scores: verified.artifact.verifier_scores,
          evidence: candidate.evidence,
          parent_id: candidate.parent_id ?? null,
          status: verified.artifact.status,
        },
        null,
        2,
      ),
      "utf8",
    );
    logStep(
      `${band} artifact ${verified.ok ? "verified" : "failed verification"}; wrote ${htmlPath}`,
    );

    summary.artifacts.push({
      band,
      title: candidate.manifest.title,
      ok: verified.ok,
      errors: verified.errors,
      html_path: htmlPath,
      manifest_path: manifestPath,
      evidence: candidate.evidence.map((evidence) => evidence.objective_code),
    });
  }

  const summaryPath = resolve(outputDir, "summary.json");
  await writeFile(summaryPath, JSON.stringify(summary, null, 2), "utf8");
  logStep(`Wrote summary ${summaryPath}`);

  console.log(JSON.stringify({ ...summary, summary_path: summaryPath }, null, 2));
}

function loadLocalEnv() {
  loadRootEnv();
}

function logStep(message: string) {
  console.error(`[${new Date().toISOString()}] ${message}`);
}
