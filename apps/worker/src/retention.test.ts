import type { SupabaseClient } from "@supabase/supabase-js";
import { afterEach, describe, expect, it } from "vitest";
import { readRetentionConfig, runRetentionCleanup } from "./retention.js";

describe("retention cleanup", () => {
  afterEach(() => {
    delete process.env.AUDIO_BUCKET;
    delete process.env.RAW_AUDIO_RETENTION_DAYS;
  });

  it("reads retention windows and the audio bucket when cleanup runs", () => {
    expect(
      readRetentionConfig({
        RAW_AUDIO_RETENTION_DAYS: "11",
        RAW_TRANSCRIPT_RETENTION_DAYS: "12",
        LESSON_STATE_RETENTION_DAYS: "13",
        AGGREGATE_REPORT_RETENTION_DAYS: "14",
        AUDIO_BUCKET: "configured-audio",
      }),
    ).toEqual({
      rawAudio: 11,
      rawTranscript: 12,
      lessonStateSummary: 13,
      aggregateReports: 14,
      audioBucket: "configured-audio",
    });
  });

  it("continues database cleanup and redacts downstream snapshots when storage deletion fails", async () => {
    process.env.AUDIO_BUCKET = "configured-audio";
    const supabase = fakeSupabase({ storageError: "bucket unavailable" });

    const result = await runRetentionCleanup(supabase.client);

    expect(supabase.storageBuckets).toEqual(["configured-audio"]);
    expect(result).toMatchObject({
      audioDeleted: 0,
      audioCleanupFailed: true,
      transcriptsCleared: 1,
      summariesDeleted: 1,
      checkpointsDeleted: 1,
      candidateContextsRedacted: 1,
    });
    expect(supabase.audioChunks[0]?.transcript_text).toBeNull();
    expect(supabase.segments).toHaveLength(0);
    expect(supabase.checkpoints).toHaveLength(0);
    expect(supabase.candidates[0]?.context_snapshot).toEqual(
      expect.objectContaining({ latest_topic: "[redacted]", examples_used: [] }),
    );
    expect(supabase.attempts[0]?.status).toBe("completed");
  });

  it("marks a manual session deletion before cancelling queued work", async () => {
    const supabase = fakeSupabase();

    await runRetentionCleanup(supabase.client, { sessionId: "session-1", reason: "manual" });

    expect(supabase.sessions[0]?.classroom_data_deletion_requested_at).toEqual(expect.any(String));
    expect(supabase.audioChunks[0]?.status).toBe("failed");
  });
});

interface FakeState {
  attempts: Array<Record<string, unknown>>;
  audioChunks: Array<Record<string, unknown>>;
  segments: Array<Record<string, unknown>>;
  checkpoints: Array<Record<string, unknown>>;
  candidates: Array<Record<string, unknown>>;
  sessions: Array<Record<string, unknown>>;
  storageError?: string;
  storageBuckets: string[];
}

function fakeSupabase(options: { storageError?: string } = {}) {
  const state: FakeState = {
    attempts: [],
    audioChunks: [{ id: "audio-1", session_id: "session-1", status: "pending", storage_path: "session-1/audio.webm", transcript_text: "sensitive" }],
    segments: [{ id: "segment-1", created_at: "2020-01-01T00:00:00.000Z" }],
    checkpoints: [{ id: "checkpoint-1", created_at: "2020-01-01T00:00:00.000Z" }],
    candidates: [{ id: "candidate-1", created_at: "2020-01-01T00:00:00.000Z", context_snapshot: { latest_topic: "La noticia" } }],
    sessions: [{ id: "session-1", classroom_data_deletion_requested_at: null }],
    storageError: options.storageError,
    storageBuckets: [],
  };

  const client = {
    from(table: string) {
      return new FakeQuery(table, state);
    },
    storage: {
      from(bucket: string) {
        state.storageBuckets.push(bucket);
        return {
          remove: async () => ({ error: state.storageError ? { message: state.storageError } : null }),
        };
      },
    },
  } as unknown as SupabaseClient;

  return { client, ...state };
}

class FakeQuery implements PromiseLike<{ data: unknown; error: { message: string } | null }> {
  private operation: "select" | "insert" | "update" | "delete" = "select";
  private filters = new Map<string, unknown>();
  private values: Record<string, unknown> = {};
  private notNullFilter: string | null = null;

  constructor(
    private readonly table: string,
    private readonly state: FakeState,
  ) {}

  select() {
    return this;
  }

  insert(values: Record<string, unknown>) {
    this.operation = "insert";
    this.values = values;
    return this;
  }

  update(values: Record<string, unknown>) {
    this.operation = "update";
    this.values = values;
    return this;
  }

  delete() {
    this.operation = "delete";
    return this;
  }

  eq(column: string, value: unknown) {
    this.filters.set(column, value);
    return this;
  }

  lt(column: string, value: unknown) {
    this.filters.set(`<${column}`, value);
    return this;
  }

  in(column: string, values: unknown[]) {
    this.filters.set(`in:${column}`, values);
    return this;
  }

  not(column: string, operator: string, value: unknown) {
    if (operator === "is" && value === null) this.notNullFilter = column;
    return this;
  }

  single() {
    return this.execute().then((result) => ({ ...result, data: Array.isArray(result.data) ? result.data[0] : result.data }));
  }

  maybeSingle() {
    return this.single();
  }

  then<TResult1 = { data: unknown; error: { message: string } | null }, TResult2 = never>(
    onfulfilled?: ((value: { data: unknown; error: { message: string } | null }) => TResult1 | PromiseLike<TResult1>) | null,
    onrejected?: ((reason: unknown) => TResult2 | PromiseLike<TResult2>) | null,
  ) {
    return this.execute().then(onfulfilled, onrejected);
  }

  private async execute() {
    const rows = this.rows().filter((row) => this.matches(row));

    if (this.operation === "insert") {
      const id = `attempt-${this.state.attempts.length + 1}`;
      const row = { id, ...this.values };
      this.state.attempts.push(row);
      return { data: [row], error: null };
    }

    if (this.operation === "update") {
      for (const row of rows) Object.assign(row, this.values);
      return { data: rows, error: null };
    }

    if (this.operation === "delete") {
      const retained = this.rows().filter((row) => !this.matches(row));
      this.replaceRows(retained);
      return { data: rows, error: null };
    }

    return { data: rows, error: null };
  }

  private rows() {
    if (this.table === "retention_deletion_attempts") return this.state.attempts;
    if (this.table === "audio_chunks") return this.state.audioChunks;
    if (this.table === "segments") return this.state.segments;
    if (this.table === "checkpoints") return this.state.checkpoints;
    if (this.table === "session_activity_candidates") return this.state.candidates;
    if (this.table === "sessions") return this.state.sessions;
    throw new Error(`unexpected fake table: ${this.table}`);
  }

  private replaceRows(rows: Array<Record<string, unknown>>) {
    const target = this.rows();
    target.splice(0, target.length, ...rows);
  }

  private matches(row: Record<string, unknown>) {
    for (const [key, value] of this.filters) {
      if (key.startsWith("<")) {
        if (!(String(row[key.slice(1)] ?? "") < String(value))) return false;
      } else if (key.startsWith("in:")) {
        if (!(value as unknown[]).includes(row[key.slice(3)])) return false;
      } else if (row[key] !== value) {
        return false;
      }
    }
    return !this.notNullFilter || this.rows().some((row) => row[this.notNullFilter!] !== null);
  }
}
