import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { activityManifestSchema } from "@kobi/activities/server";
import { loadRootEnv } from "@kobi/db";
import { createActivityRuntimeVerifierFromEnv } from "../activity-generation/runtimeVerifierFactory.js";

loadRootEnv();

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});

async function main(): Promise<void> {
  const [htmlArgument, manifestArgument] = process.argv.slice(2);
  if (!htmlArgument || !manifestArgument) {
    throw new Error(
      "Usage: pnpm --filter @kobi/worker verify:modal-artifact -- <index.html> <manifest.json>",
    );
  }

  const selection = createActivityRuntimeVerifierFromEnv({
    ...process.env,
    ACTIVITY_RUNTIME_VERIFIER: "modal",
  });
  const htmlPath = resolve(htmlArgument);
  const manifestPath = resolve(manifestArgument);
  const [bundleHtml, manifestSource] = await Promise.all([
    readFile(htmlPath, "utf8"),
    readFile(manifestPath, "utf8"),
  ]);
  const decoded: unknown = JSON.parse(manifestSource);
  const manifestCandidate =
    decoded && typeof decoded === "object" && "manifest" in decoded
      ? decoded.manifest
      : decoded;
  const manifest = activityManifestSchema.parse(manifestCandidate);

  const startedAt = Date.now();
  const result = await selection.verifier({ bundleHtml, manifest });
  console.log(JSON.stringify({
    backend: selection.backend,
    htmlPath,
    manifestPath,
    durationMs: Date.now() - startedAt,
    ...result,
  }, null, 2));
}