import type { SupabaseClient } from "@supabase/supabase-js";
import type PgBoss from "pg-boss";
import { JOB_EVALUATE_CHECKPOINT } from "../queue.js";
import { incrementMetric, measured } from "../operations.js";

export const CHECKPOINT_SCHEDULER_JOB_NAME = "checkpoint-scheduler";
export const CHECKPOINT_SCHEDULER_CRON = "* * * * *";
const DEFAULT_CHECKPOINT_INTERVAL_MINUTES = 10;
const DEFAULT_BATCH_SIZE = 50;
const DEFAULT_CONCURRENCY = 5;

export interface CheckpointSchedulerJobOptions {
  intervalMinutes?: number;
  batchSize?: number;
  concurrency?: number;
}

export interface DueSessionRow {
  id: string;
  startedAt: string;
}

/**
 * Global recurring tick (pg-boss cron, every minute) that finds active
 * sessions whose last checkpoint is older than CHECKPOINT_INTERVAL_MINUTES
 * and enqueues evaluate-checkpoint for them. Independent from
 * build-lesson-state's per-chunk cadence — this is the "checkpoint a cierta
 * cantidad de tiempo" timer, decoupled from the Understand loop.
 */
export function registerCheckpointSchedulerJob(
  boss: PgBoss,
  supabase: SupabaseClient,
  options: CheckpointSchedulerJobOptions = {},
) {
  const intervalMinutes = options.intervalMinutes ?? readCheckpointIntervalMinutes();

  return boss.work(CHECKPOINT_SCHEDULER_JOB_NAME, { batchSize: 1 }, async () => {
    await runCheckpointSchedulerTick(supabase, boss, intervalMinutes, {
      batchSize: options.batchSize,
      concurrency: options.concurrency,
    });
  });
}

/** Registers the recurring cron trigger; call once at worker startup alongside registerCheckpointSchedulerJob. */
export async function scheduleCheckpointSchedulerJob(boss: PgBoss): Promise<void> {
  await boss.schedule(CHECKPOINT_SCHEDULER_JOB_NAME, CHECKPOINT_SCHEDULER_CRON, {});
}

export async function runCheckpointSchedulerTick(
  supabase: SupabaseClient,
  boss: PgBoss,
  intervalMinutes: number,
  options: { batchSize?: number; concurrency?: number } = {},
): Promise<{ enqueued: string[] }> {
  return measured("checkpoint_scheduler", {}, async () => {
    const batchSize = options.batchSize ?? readPositiveIntegerEnv("CHECKPOINT_SCHEDULER_BATCH_SIZE", DEFAULT_BATCH_SIZE);
    const concurrency = options.concurrency ?? readPositiveIntegerEnv("CHECKPOINT_SCHEDULER_CONCURRENCY", DEFAULT_CONCURRENCY);
    const dueSessionIds = await loadDueSessionIds(supabase, intervalMinutes, batchSize);
    for (let offset = 0; offset < dueSessionIds.length; offset += concurrency) {
      await Promise.all(dueSessionIds.slice(offset, offset + concurrency).map(async (sessionId) => {
        await boss.send(
          JOB_EVALUATE_CHECKPOINT,
          { sessionId, correlationId: `scheduler:${sessionId}:${Date.now()}` },
          { singletonKey: sessionId, singletonSeconds: Math.max(intervalMinutes * 60 - 5, 30) },
        );
      }));
    }
    incrementMetric("checkpoint_scheduler_sessions_total", {}, dueSessionIds.length);
    return { enqueued: dueSessionIds };
  });
}

/** Pure selection logic, kept separate from I/O so it's cheap to unit test. */
export function selectDueSessionIds(
  sessions: DueSessionRow[],
  lastCheckpointBySession: Map<string, string>,
  intervalMinutes: number,
  now: Date,
): string[] {
  const intervalMs = intervalMinutes * 60_000;

  return sessions
    .filter((session) => {
      const dueSince = lastCheckpointBySession.get(session.id) ?? session.startedAt;
      const elapsedMs = now.getTime() - new Date(dueSince).getTime();
      return elapsedMs >= intervalMs;
    })
    .map((session) => session.id);
}

async function loadDueSessionIds(
  supabase: SupabaseClient,
  intervalMinutes: number,
  batchSize: number,
): Promise<string[]> {
  const { data, error } = await supabase.rpc("get_due_checkpoint_sessions", {
    p_interval_minutes: intervalMinutes,
    p_limit: batchSize,
  });

  if (error) {
    throw new Error(`checkpointScheduler job: failed to load due sessions: ${error.message}`);
  }
  return (data ?? []).map((row: { session_id: unknown }) => String(row.session_id));
}

function readCheckpointIntervalMinutes(): number {
  const raw = process.env.CHECKPOINT_INTERVAL_MINUTES;
  if (!raw) return DEFAULT_CHECKPOINT_INTERVAL_MINUTES;

  const parsed = Number.parseInt(raw, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : DEFAULT_CHECKPOINT_INTERVAL_MINUTES;
}

function readPositiveIntegerEnv(name: string, fallback: number) {
  const parsed = Number.parseInt(process.env[name] ?? "", 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}
