import { loadRootEnv } from "@kobi/db";
loadRootEnv();

import { createClient } from "@supabase/supabase-js";
import { getQueue } from "./queue.js";
import { registerTranscribeChunkJob } from "./jobs/transcribeChunk.job.js";
import { registerBuildLessonStateJob } from "./jobs/buildLessonState.job.js";
import { registerGenerateActivityArtifactsJob } from "./jobs/generateActivityArtifacts.job.js";

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
  const supabase = createClient(
    supabaseUrl,
    process.env.SUPABASE_SERVICE_ROLE_KEY ?? "",
  );

  const boss = await getQueue();

  await registerTranscribeChunkJob(boss, supabase);
  await registerBuildLessonStateJob(boss, supabase);
  await registerGenerateActivityArtifactsJob(boss, supabase);

  console.log("Kobi worker running: transcribe-chunk, build-lesson-state, generate-activity-artifacts");
}

main().catch((error) => {
  console.error("Worker failed to start:", error);
  process.exit(1);
});
