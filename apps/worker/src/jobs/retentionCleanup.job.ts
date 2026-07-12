import type PgBoss from "pg-boss";
import type { SupabaseClient } from "@supabase/supabase-js";
import { JOB_RETENTION_CLEANUP } from "../queue.js";
import { runRetentionCleanup } from "../retention.js";

export function registerRetentionCleanupJob(boss: PgBoss, supabase: SupabaseClient) {
  return boss.work(JOB_RETENTION_CLEANUP, { batchSize: 1 }, async () => {
    await runRetentionCleanup(supabase);
  });
}

export async function scheduleRetentionCleanupJob(boss: PgBoss) {
  await boss.schedule(JOB_RETENTION_CLEANUP, process.env.RETENTION_CLEANUP_CRON ?? "17 3 * * *", {}, {
    retryLimit: 5,
    retryDelay: 300,
    retryBackoff: true,
  });
}
