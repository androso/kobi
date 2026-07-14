import type { SupabaseClient } from "@supabase/supabase-js";
import { buildCurriculumQueryText, retrieveCurriculumMatches } from "@kobi/curriculum";
import { lessonStateSchema } from "@kobi/ai-core";
import type PgBoss from "pg-boss";
import { JOB_CHECKPOINT_OUTBOX_DISPATCHER, JOB_GENERATE_ACTIVITY_ARTIFACTS } from "../queue.js";

export const CHECKPOINT_GENERATION_LEASE_MS = 15 * 60 * 1000;
const OUTBOX_BATCH_SIZE = 10;
const OUTBOX_SELECT =
  "id, checkpoint_id, status, attempts, dispatch_started_at, generation_started_at, queue_job_id, checkpoints(session_id, latest_lesson_state, sessions(classes(grade, subject, unit)))";

type CheckpointOutboxRow = {
  id: string;
  checkpoint_id: string;
  status: string;
  attempts: number;
  dispatch_started_at: string | null;
  generation_started_at: string | null;
  queue_job_id: string | null;
  checkpoints: unknown;
};

export interface CheckpointOutboxDispatcherOptions {
  now?: () => Date;
  generationLeaseMs?: number;
  batchSize?: number;
}

export function registerCheckpointOutboxDispatcherJob(boss: PgBoss, supabase: SupabaseClient) {
  return boss.work(JOB_CHECKPOINT_OUTBOX_DISPATCHER, { batchSize: 1 }, async () => {
    await dispatchCheckpointOutbox(supabase, boss);
  });
}

export async function scheduleCheckpointOutboxDispatcherJob(boss: PgBoss) {
  await boss.schedule(JOB_CHECKPOINT_OUTBOX_DISPATCHER, "* * * * *", {}, { tz: "UTC" });
}

export async function dispatchCheckpointOutbox(
  supabase: SupabaseClient,
  boss: PgBoss,
  options: CheckpointOutboxDispatcherOptions = {},
) {
  const batchSize = options.batchSize ?? OUTBOX_BATCH_SIZE;
  const now = (options.now ?? (() => new Date()))();
  const staleBefore = new Date(
    now.getTime() - (options.generationLeaseMs ?? CHECKPOINT_GENERATION_LEASE_MS),
  ).toISOString();
  const rows = await loadDispatchRows(supabase, staleBefore, batchSize);
  let delivered = 0;

  for (const row of rows) {
    const claimed = await supabase
      .from("checkpoint_generation_outbox")
      .update({
        status: "dispatching",
        attempts: Number(row.attempts) + 1,
        dispatch_started_at: now.toISOString(),
        last_error: null,
      })
      .eq("id", row.id)
      .or(
        [
          "status.eq.pending",
          "status.eq.failed",
          `and(status.eq.running,generation_started_at.lt.${staleBefore})`,
          `and(status.eq.dispatching,dispatch_started_at.lt.${staleBefore})`,
          "and(status.eq.dispatching,dispatch_started_at.is.null)",
          "and(status.eq.delivered,queue_job_id.is.null)",
        ].join(","),
      )
      .select("id")
      .maybeSingle();

    if (claimed.error) {
      throw new Error(`checkpoint outbox dispatcher: failed to claim ${row.id}: ${claimed.error.message}`);
    }
    if (!claimed.data) continue;

    try {
      const checkpoint: any = Array.isArray(row.checkpoints) ? row.checkpoints[0] : row.checkpoints;
      const state = lessonStateSchema.parse(checkpoint.latest_lesson_state);
      const classes: any = Array.isArray(checkpoint.sessions?.classes)
        ? checkpoint.sessions.classes[0]
        : checkpoint.sessions?.classes;
      const matches = await retrieveCurriculumMatches(supabase, {
        queryText: buildCurriculumQueryText(state),
        grade: Number(classes?.grade) || 7,
        subject: classes?.subject || "lenguaje",
        unit: classes?.unit || undefined,
      });

      const prepared = await supabase
        .from("checkpoint_generation_outbox")
        .update({
          status: "delivered",
          curriculum_matches: matches,
          delivered_at: new Date().toISOString(),
          last_error: null,
        })
        .eq("id", row.id)
        .eq("status", "dispatching")
        .select("id")
        .maybeSingle();
      if (prepared.error) throw new Error(`failed to mark handoff claimable: ${prepared.error.message}`);
      if (!prepared.data) throw new Error("handoff was no longer dispatching before enqueue");

      const jobId = await boss.send(
        JOB_GENERATE_ACTIVITY_ARTIFACTS,
        { checkpointId: row.checkpoint_id },
        { singletonKey: row.checkpoint_id },
      );
      if (!jobId) throw new Error("pg-boss did not create a generation job");

      const recorded = await supabase
        .from("checkpoint_generation_outbox")
        .update({ queue_job_id: String(jobId) })
        .eq("id", row.id)
        .in("status", ["delivered", "running", "completed"])
        .select("id")
        .maybeSingle();
      if (recorded.error) throw new Error(`failed to record generation job: ${recorded.error.message}`);
      if (!recorded.data) throw new Error("handoff was no longer available after enqueue");

      delivered++;
    } catch (cause) {
      await markDispatchFailed(supabase, row.id, cause instanceof Error ? cause.message : String(cause));
    }
  }

  return { delivered };
}

async function loadDispatchRows(supabase: SupabaseClient, staleBefore: string, batchSize: number) {
  const pending = await supabase
    .from("checkpoint_generation_outbox")
    .select(OUTBOX_SELECT)
    .eq("status", "pending")
    .order("created_at", { ascending: true })
    .limit(batchSize);
  if (pending.error) throw new Error(`checkpoint outbox dispatcher: failed to load pending handoffs: ${pending.error.message}`);

  const pendingRows = (pending.data ?? []) as CheckpointOutboxRow[];
  const remaining = Math.max(0, batchSize - pendingRows.length);
  if (remaining === 0) return pendingRows;

  const retryable = await supabase
    .from("checkpoint_generation_outbox")
    .select(OUTBOX_SELECT)
    .or(
      [
        "status.eq.failed",
        `and(status.eq.running,generation_started_at.lt.${staleBefore})`,
        `and(status.eq.dispatching,dispatch_started_at.lt.${staleBefore})`,
        "and(status.eq.dispatching,dispatch_started_at.is.null)",
        "and(status.eq.delivered,queue_job_id.is.null)",
      ].join(","),
    )
    .order("created_at", { ascending: true })
    .limit(remaining);
  if (retryable.error) {
    throw new Error(`checkpoint outbox dispatcher: failed to load retryable handoffs: ${retryable.error.message}`);
  }

  return pendingRows.concat((retryable.data ?? []) as CheckpointOutboxRow[]);
}

async function markDispatchFailed(supabase: SupabaseClient, outboxId: string, message: string) {
  const { error } = await supabase
    .from("checkpoint_generation_outbox")
    .update({ status: "failed", last_error: message })
    .eq("id", outboxId)
    .in("status", ["dispatching", "delivered"]);
  if (error) throw new Error(`checkpoint outbox dispatcher: failed to record failure for ${outboxId}: ${error.message}`);
}
