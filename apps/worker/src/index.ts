import { loadRootEnv } from "@kobi/db";
loadRootEnv();

import { createClient } from "@supabase/supabase-js";
import { getQueue, stopQueue } from "./queue.js";
import { registerTranscribeChunkJob } from "./jobs/transcribeChunk.job.js";
import { registerBuildLessonStateJob } from "./jobs/buildLessonState.job.js";
import { registerGenerateActivityArtifactsJob } from "./jobs/generateActivityArtifacts.job.js";
import { registerEvaluateCheckpointJob } from "./jobs/evaluateCheckpoint.job.js";
import {
  registerCheckpointSchedulerJob,
  scheduleCheckpointSchedulerJob,
} from "./jobs/checkpointScheduler.job.js";
import { startApiServer } from "./api.js";
import { registerRetentionCleanupJob, scheduleRetentionCleanupJob } from "./jobs/retentionCleanup.job.js";

async function main() {
  const supabaseUrl =
    process.env.SUPABASE_URL ??
    process.env.NEXT_PUBLIC_SUPABASE_URL ??
    process.env.VITE_SUPABASE_URL;
  if (!supabaseUrl) {
    throw new Error(
      "Missing SUPABASE_URL (or NEXT_PUBLIC_SUPABASE_URL / VITE_SUPABASE_URL). " +
        "Ensure .env.local exists at the repo root with the required variables."
    );
  }
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!serviceRoleKey) {
    throw new Error("Missing SUPABASE_SERVICE_ROLE_KEY. The worker API needs it for storage and queue-backed writes.");
  }

  const supabase = createClient(supabaseUrl, serviceRoleKey);

  const boss = await getQueue();

  await registerTranscribeChunkJob(boss, supabase);
  await registerBuildLessonStateJob(boss, supabase);
  await registerGenerateActivityArtifactsJob(boss, supabase);
  await registerEvaluateCheckpointJob(boss, supabase);
  await registerCheckpointSchedulerJob(boss, supabase);
  await scheduleCheckpointSchedulerJob(boss);
  await registerRetentionCleanupJob(boss, supabase);
  await scheduleRetentionCleanupJob(boss);
  const server = startApiServer({ supabase, boss });

  console.log(
    "Kobi worker running: API, transcribe-chunk, build-lesson-state, checkpoint-scheduler, evaluate-checkpoint, generate-activity-artifacts",
  );

  let shuttingDown = false;
  async function shutdown(signal: string) {
    if (shuttingDown) return;
    shuttingDown = true;
    console.log(`[worker] shutting down (${signal})...`);
    server.closeAllConnections?.();
    await new Promise<void>((resolve) => server.close(() => resolve()));
    await stopQueue();
    process.exit(0);
  }

  process.once("SIGTERM", () => void shutdown("SIGTERM"));
  process.once("SIGINT", () => void shutdown("SIGINT"));
}

main().catch((error) => {
  console.error("Worker failed to start:", error);
  process.exit(1);
});
