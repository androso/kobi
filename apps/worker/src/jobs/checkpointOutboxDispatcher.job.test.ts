import { describe, expect, it, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import type PgBoss from "pg-boss";
import { retrieveCurriculumMatches } from "@kobi/curriculum";
import { dispatchCheckpointOutbox } from "./checkpointOutboxDispatcher.job.js";

vi.mock("@kobi/curriculum", () => ({
  buildCurriculumQueryText: vi.fn(() => "curriculum query"),
  retrieveCurriculumMatches: vi.fn(),
}));

const matches = [
  {
    objective_code: "L7.4.2",
    unit: "U4",
    grade: 7,
    subject: "lenguaje",
    text: "La noticia",
    similarity: 0.9,
  },
];

const lessonState = {
  topic: "La noticia",
  objective_guess: "Reconocer sus partes",
  key_terms: ["titular"],
  transcript_summary: "La clase trabajo la noticia.",
  confidence: 0.9,
  evidence: { quoted_phrases: ["titular"], reason: "La clase lo explico." },
};

describe("checkpoint outbox dispatcher", () => {
  it("marks a handoff delivered before enqueueing and records the queue job", async () => {
    vi.mocked(retrieveCurriculumMatches).mockResolvedValue(matches);
    const supabase = fakeSupabase({ pendingRows: [outboxRow("pending-1", "pending")] });
    const boss = fakeBoss(() => {
      expect(supabase.updatesFor("pending-1").filter((update) => update.status).map((update) => update.status)).toEqual([
        "dispatching",
        "delivered",
      ]);
    });

    await dispatchCheckpointOutbox(supabase.client, boss.instance);

    expect(supabase.updatesFor("pending-1").filter((update) => update.status).map((update) => update.status)).toEqual([
      "dispatching",
      "delivered",
    ]);
    expect(supabase.updatesFor("pending-1").at(-1)).toMatchObject({ queue_job_id: "job-1" });
    expect(boss.sent[0]?.data).toEqual({ checkpointId: "checkpoint-pending-1" });
  });

  it("selects pending work before retrying older failed work", async () => {
    vi.mocked(retrieveCurriculumMatches).mockResolvedValue(matches);
    const supabase = fakeSupabase({
      pendingRows: [outboxRow("new-pending", "pending")],
      retryableRows: Array.from({ length: 10 }, (_, index) => outboxRow(`failed-${index}`, "failed")),
    });
    const boss = fakeBoss();

    await dispatchCheckpointOutbox(supabase.client, boss.instance);

    expect(boss.sent[0]?.data).toEqual({ checkpointId: "checkpoint-new-pending" });
  });

  it("reclaims a stale running generation row", async () => {
    vi.mocked(retrieveCurriculumMatches).mockResolvedValue(matches);
    const now = new Date("2026-07-13T12:00:00.000Z");
    const supabase = fakeSupabase({ retryableRows: [outboxRow("stale-1", "running")] });
    const boss = fakeBoss();

    await dispatchCheckpointOutbox(supabase.client, boss.instance, { now: () => now, generationLeaseMs: 60_000 });

    expect(supabase.orFilters.some((filter) => filter.includes("status.eq.running,generation_started_at.lt.2026-07-13T11:59:00.000Z"))).toBe(true);
    expect(supabase.updatesFor("stale-1").filter((update) => update.status).map((update) => update.status)).toEqual([
      "dispatching",
      "delivered",
    ]);
  });

  it("surfaces a real claim error instead of treating it as a lost race", async () => {
    vi.mocked(retrieveCurriculumMatches).mockResolvedValue(matches);
    const supabase = fakeSupabase({
      pendingRows: [outboxRow("claim-error", "pending")],
      claimError: { message: "permission denied" },
    });

    await expect(dispatchCheckpointOutbox(supabase.client, fakeBoss().instance)).rejects.toThrow(
      "failed to claim claim-error: permission denied",
    );
  });
});

type OutboxRow = {
  id: string;
  checkpoint_id: string;
  status: string;
  attempts: number;
  generation_started_at: string | null;
  checkpoints: { latest_lesson_state: typeof lessonState; sessions: { classes: { grade: number; subject: string; unit: string } } };
};

function outboxRow(id: string, status: string): OutboxRow {
  return {
    id,
    checkpoint_id: `checkpoint-${id}`,
    status,
    attempts: 0,
    generation_started_at: status === "running" ? "2026-07-13T11:00:00.000Z" : null,
    checkpoints: {
      latest_lesson_state: lessonState,
      sessions: { classes: { grade: 7, subject: "lenguaje", unit: "U4" } },
    },
  };
}

function fakeBoss(beforeSend?: () => void) {
  const sent: Array<{ name: string; data: unknown; options: unknown }> = [];
  const instance = {
    send: async (name: string, data: unknown, options: unknown) => {
      beforeSend?.();
      sent.push({ name, data, options });
      return "job-1";
    },
  } as unknown as PgBoss;
  return { instance, sent };
}

function fakeSupabase(options: {
  pendingRows?: OutboxRow[];
  retryableRows?: OutboxRow[];
  claimError?: { message: string };
}) {
  const updates: Array<{ id: string; values: Record<string, unknown> }> = [];
  const orFilters: string[] = [];
  const state = { claimError: options.claimError };
  const client = {
    from(table: string) {
      if (table !== "checkpoint_generation_outbox") throw new Error(`unexpected table ${table}`);
      return new OutboxQuery(table, options, updates, orFilters, state);
    },
  } as unknown as SupabaseClient;

  return {
    client,
    orFilters,
    updatesFor(id: string) {
      return updates.filter((update) => update.id === id).map((update) => update.values);
    },
  };
}

class OutboxQuery {
  private operation: "select" | "update" | null = null;
  private values: Record<string, unknown> = {};
  private id = "";
  private status = "";

  constructor(
    private readonly table: string,
    private readonly options: { pendingRows?: OutboxRow[]; retryableRows?: OutboxRow[] },
    private readonly updates: Array<{ id: string; values: Record<string, unknown> }>,
    private readonly orFilters: string[],
    private readonly state: { claimError?: { message: string } },
  ) {}

  select(_columns?: string) {
    if (this.operation === null) this.operation = "select";
    return this;
  }

  update(values: Record<string, unknown>) {
    this.operation = "update";
    this.values = values;
    return this;
  }

  eq(column: string, value: string) {
    if (column === "id") this.id = value;
    if (column === "status") this.status = value;
    return this;
  }

  in(_column: string, _values: string[]) {
    return this;
  }

  or(filter: string) {
    this.orFilters.push(filter);
    return this;
  }

  order(_column: string, _options: { ascending: boolean }) {
    return this;
  }

  limit(_value: number) {
    return this;
  }

  maybeSingle() {
    return Promise.resolve(this.result(true));
  }

  then<TResult1 = unknown, TResult2 = never>(
    onfulfilled?: ((value: unknown) => TResult1 | PromiseLike<TResult1>) | null,
    onrejected?: ((reason: unknown) => TResult2 | PromiseLike<TResult2>) | null,
  ) {
    return Promise.resolve(this.result(false)).then(onfulfilled, onrejected);
  }

  private result(single: boolean) {
    if (this.operation === "select") {
      const rows = this.status === "pending" ? this.options.pendingRows ?? [] : this.options.retryableRows ?? [];
      return { data: rows, error: null };
    }

    this.updates.push({ id: this.id, values: this.values });
    if (this.values.status === "dispatching" && this.state.claimError) {
      const error = this.state.claimError;
      this.state.claimError = undefined;
      return { data: null, error };
    }

    return { data: single ? { id: this.id } : null, error: null };
  }
}
