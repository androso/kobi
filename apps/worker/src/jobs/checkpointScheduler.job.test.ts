import { afterEach, describe, expect, it, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import type PgBoss from "pg-boss";
import {
  runCheckpointSchedulerTick,
  selectDueSessionIds,
  type DueSessionRow,
} from "./checkpointScheduler.job.js";
import { JOB_EVALUATE_CHECKPOINT } from "../queue.js";

describe("selectDueSessionIds", () => {
  const now = new Date("2026-01-01T00:20:00Z");

  it("selects sessions whose last checkpoint is older than the interval", () => {
    const sessions: DueSessionRow[] = [
      { id: "session-due", startedAt: "2026-01-01T00:00:00Z" },
      { id: "session-recent", startedAt: "2026-01-01T00:00:00Z" },
    ];
    const lastCheckpointBySession = new Map([
      ["session-due", "2026-01-01T00:05:00Z"], // 15 min ago -> due at 10 min interval
      ["session-recent", "2026-01-01T00:15:00Z"], // 5 min ago -> not due
    ]);

    const due = selectDueSessionIds(sessions, lastCheckpointBySession, 10, now);

    expect(due).toEqual(["session-due"]);
  });

  it("falls back to session start time when there is no prior checkpoint", () => {
    const sessions: DueSessionRow[] = [{ id: "session-new", startedAt: "2026-01-01T00:05:00Z" }];

    const due = selectDueSessionIds(sessions, new Map(), 10, now);

    expect(due).toEqual(["session-new"]);
  });

  it("does not select a freshly started session before the interval elapses", () => {
    const sessions: DueSessionRow[] = [{ id: "session-new", startedAt: "2026-01-01T00:15:00Z" }];

    const due = selectDueSessionIds(sessions, new Map(), 10, now);

    expect(due).toEqual([]);
  });
});

describe("runCheckpointSchedulerTick", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("enqueues evaluate-checkpoint only for due sessions, deduped with a singleton key", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-01-01T00:20:00Z"));

    const supabase = fakeSupabase({
      activeSessions: [
        { id: "session-due", started_at: "2026-01-01T00:00:00Z" },
        { id: "session-recent", started_at: "2026-01-01T00:00:00Z" },
      ],
      checkpoints: [
        { session_id: "session-due", created_at: "2026-01-01T00:05:00Z" },
        { session_id: "session-recent", created_at: "2026-01-01T00:15:00Z" },
      ],
    });
    const boss = fakeBoss();

    const result = await runCheckpointSchedulerTick(supabase.client, boss.instance, 10);

    expect(result.enqueued).toEqual(["session-due"]);
    expect(boss.sent).toHaveLength(1);
    expect(boss.sent[0].name).toBe(JOB_EVALUATE_CHECKPOINT);
    expect(boss.sent[0].data).toEqual({ sessionId: "session-due" });
    expect(boss.sent[0].options).toMatchObject({ singletonKey: "session-due" });
  });

  it("does nothing when there are no active sessions", async () => {
    const supabase = fakeSupabase({ activeSessions: [], checkpoints: [] });
    const boss = fakeBoss();

    const result = await runCheckpointSchedulerTick(supabase.client, boss.instance, 10);

    expect(result.enqueued).toEqual([]);
    expect(boss.sent).toHaveLength(0);
  });
});

interface FakeSupabaseOptions {
  activeSessions: { id: string; started_at: string }[];
  checkpoints: { session_id: string; created_at: string }[];
}

function fakeSupabase(options: FakeSupabaseOptions) {
  const client = {
    from(table: string) {
      if (table === "sessions") {
        return new SessionsQuery(options.activeSessions);
      }
      if (table === "checkpoints") {
        return new CheckpointsQuery(options.checkpoints);
      }
      throw new Error(`fakeSupabase: unexpected table ${table}`);
    },
  } as unknown as SupabaseClient;

  return { client };
}

class SessionsQuery {
  constructor(private readonly rows: { id: string; started_at: string }[]) {}

  select() {
    return this;
  }

  eq() {
    return this;
  }

  then<TResult1 = unknown, TResult2 = never>(
    onfulfilled?: ((value: { data: unknown[]; error: null }) => TResult1 | PromiseLike<TResult1>) | null,
    onrejected?: ((reason: unknown) => TResult2 | PromiseLike<TResult2>) | null,
  ) {
    return Promise.resolve({ data: this.rows, error: null }).then(onfulfilled, onrejected);
  }
}

class CheckpointsQuery {
  constructor(private readonly rows: { session_id: string; created_at: string }[]) {}

  select() {
    return this;
  }

  in() {
    return this;
  }

  order() {
    return this;
  }

  then<TResult1 = unknown, TResult2 = never>(
    onfulfilled?: ((value: { data: unknown[]; error: null }) => TResult1 | PromiseLike<TResult1>) | null,
    onrejected?: ((reason: unknown) => TResult2 | PromiseLike<TResult2>) | null,
  ) {
    const sorted = [...this.rows].sort((a, b) => (a.created_at < b.created_at ? 1 : -1));
    return Promise.resolve({ data: sorted, error: null }).then(onfulfilled, onrejected);
  }
}

function fakeBoss() {
  const sent: { name: string; data: unknown; options?: unknown }[] = [];

  const instance = {
    send: async (name: string, data: unknown, sendOptions?: unknown) => {
      sent.push({ name, data, options: sendOptions });
      return "job-id";
    },
  } as unknown as PgBoss;

  return { instance, sent };
}
