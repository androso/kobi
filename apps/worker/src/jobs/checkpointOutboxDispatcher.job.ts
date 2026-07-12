import type { SupabaseClient } from "@supabase/supabase-js";
import { buildCurriculumQueryText, retrieveCurriculumMatches } from "@kobi/curriculum";
import { lessonStateSchema } from "@kobi/ai-core";
import type PgBoss from "pg-boss";
import { JOB_CHECKPOINT_OUTBOX_DISPATCHER, JOB_GENERATE_ACTIVITY_ARTIFACTS } from "../queue.js";

export function registerCheckpointOutboxDispatcherJob(boss: PgBoss, supabase: SupabaseClient) {
  return boss.work(JOB_CHECKPOINT_OUTBOX_DISPATCHER, { batchSize: 1 }, async () => { await dispatchCheckpointOutbox(supabase, boss); });
}
export async function scheduleCheckpointOutboxDispatcherJob(boss: PgBoss) {
  await boss.schedule(JOB_CHECKPOINT_OUTBOX_DISPATCHER, "* * * * *", {}, { tz: "UTC" });
}
export async function dispatchCheckpointOutbox(supabase: SupabaseClient, boss: PgBoss) {
  const { data: rows, error } = await supabase.from("checkpoint_generation_outbox")
    .select("id, checkpoint_id, attempts, checkpoints(session_id, latest_lesson_state, sessions(classes(grade, subject, unit)))")
    .in("status", ["pending", "failed"]).order("created_at", { ascending: true }).limit(10);
  if (error) throw new Error(`checkpoint outbox dispatcher: failed to load handoffs: ${error.message}`);
  let delivered = 0;
  for (const row of rows ?? []) {
    const claimed = await supabase.from("checkpoint_generation_outbox").update({ status: "dispatching", attempts: Number(row.attempts) + 1, last_error: null }).eq("id", row.id).in("status", ["pending", "failed"]).select("id").maybeSingle();
    if (claimed.error || !claimed.data) continue;
    try {
      const checkpoint: any = Array.isArray(row.checkpoints) ? row.checkpoints[0] : row.checkpoints;
      const state = lessonStateSchema.parse(checkpoint.latest_lesson_state);
      const classes: any = Array.isArray(checkpoint.sessions?.classes) ? checkpoint.sessions.classes[0] : checkpoint.sessions?.classes;
      const matches = await retrieveCurriculumMatches(supabase, { queryText: buildCurriculumQueryText(state), grade: Number(classes?.grade) || 7, subject: classes?.subject || "lenguaje", unit: classes?.unit || undefined });
      const jobId = await boss.send(JOB_GENERATE_ACTIVITY_ARTIFACTS, { checkpointId: row.checkpoint_id }, { singletonKey: row.checkpoint_id });
      if (!jobId) throw new Error("pg-boss did not create a generation job");
      const saved = await supabase.from("checkpoint_generation_outbox").update({ status: "delivered", curriculum_matches: matches, queue_job_id: String(jobId), delivered_at: new Date().toISOString(), last_error: null }).eq("id", row.id);
      if (saved.error) throw saved.error;
      delivered++;
    } catch (cause) {
      await supabase.from("checkpoint_generation_outbox").update({ status: "failed", last_error: cause instanceof Error ? cause.message : String(cause) }).eq("id", row.id);
    }
  }
  return { delivered };
}
