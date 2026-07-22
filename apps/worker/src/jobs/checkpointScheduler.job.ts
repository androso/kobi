import type { SupabaseClient } from "@supabase/supabase-js";
import type PgBoss from "pg-boss";
import { JOB_EVALUATE_CHECKPOINT } from "../queue.js";

export const CHECKPOINT_SCHEDULER_JOB_NAME = "checkpoint-scheduler";
export const CHECKPOINT_SCHEDULER_CRON = "* * * * *";
const DEFAULT_CHECKPOINT_INTERVAL_MINUTES = 2;

export interface CheckpointSchedulerJobOptions {
  intervalMinutes?: number;
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
    await runCheckpointSchedulerTick(supabase, boss, intervalMinutes);
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
): Promise<{ enqueued: string[] }> {
  const activeSessions = await loadActiveSessions(supabase);
  if (activeSessions.length === 0) return { enqueued: [] };

  const lastCheckpointBySession = await loadLastCheckpointAtBySession(
    supabase,
    activeSessions.map((session) => session.id),
  );

  const dueSessionIds = selectDueSessionIds(
    activeSessions,
    lastCheckpointBySession,
    intervalMinutes,
    new Date(),
  );

  for (const sessionId of dueSessionIds) {
    await boss.send(
      JOB_EVALUATE_CHECKPOINT,
      { sessionId },
      { singletonKey: sessionId, singletonSeconds: Math.max(intervalMinutes * 60 - 5, 30) },
    );
  }

  return { enqueued: dueSessionIds };
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

async function loadActiveSessions(supabase: SupabaseClient): Promise<DueSessionRow[]> {
  const { data, error } = await supabase
    .from("sessions")
    .select("id, started_at")
    .eq("status", "active");

  if (error) {
    throw new Error(`checkpointScheduler job: failed to load active sessions: ${error.message}`);
  }

  return (data ?? []).map((row) => ({ id: String(row.id), startedAt: String(row.started_at) }));
}

async function loadLastCheckpointAtBySession(
  supabase: SupabaseClient,
  sessionIds: string[],
): Promise<Map<string, string>> {
  if (sessionIds.length === 0) return new Map();

  const { data, error } = await supabase
    .from("checkpoints")
    .select("session_id, created_at")
    .in("session_id", sessionIds)
    .order("created_at", { ascending: false });

  if (error) {
    throw new Error(`checkpointScheduler job: failed to load checkpoints: ${error.message}`);
  }

  const lastCheckpointBySession = new Map<string, string>();
  for (const row of data ?? []) {
    const sessionId = String(row.session_id);
    if (!lastCheckpointBySession.has(sessionId)) {
      lastCheckpointBySession.set(sessionId, String(row.created_at));
    }
  }

  return lastCheckpointBySession;
}

function readCheckpointIntervalMinutes(): number {
  const raw = process.env.CHECKPOINT_INTERVAL_MINUTES;
  if (!raw) return DEFAULT_CHECKPOINT_INTERVAL_MINUTES;

  const parsed = Number.parseInt(raw, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : DEFAULT_CHECKPOINT_INTERVAL_MINUTES;
}
