import { describe, expect, it } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import { runGenerateActivityArtifactsJob } from "./generateActivityArtifacts.job.js";

describe("generateActivityArtifacts checkpoint state transitions", () => {
  it("claims a delivered handoff as running and completes it when there is no work", async () => {
    const supabase = fakeGenerationSupabase();

    const result = await runGenerateActivityArtifactsJob(supabase.client, { checkpointId: "checkpoint-1" });

    expect(result.skippedReason).toBe("no curriculum matches");
    expect(supabase.transitions).toEqual(["running", "completed"]);
  });

  it("records checkpoint validation failures through the failed transition", async () => {
    const supabase = fakeGenerationSupabase({ invalidCheckpoint: true });

    await expect(runGenerateActivityArtifactsJob(supabase.client, { checkpointId: "checkpoint-1" })).rejects.toThrow(
      "checkpoint has no approved segment range",
    );

    expect(supabase.transitions).toEqual(["running", "failed"]);
    expect(supabase.failureUpdates[0]).toMatchObject({
      status: "failed",
      last_error: "generateActivityArtifacts job: checkpoint has no approved segment range",
    });
  });

  it("scopes generation failure updates to the timestamp of the current claim", async () => {
    const supabase = fakeGenerationSupabase({ currentCandidatesError: "candidate read failed" });

    await expect(runGenerateActivityArtifactsJob(supabase.client, { checkpointId: "checkpoint-1" })).rejects.toThrow(
      "failed to load current candidates: candidate read failed",
    );

    expect(supabase.failureFilters).toEqual([
      { column: "checkpoint_id", value: "checkpoint-1" },
      { column: "status", value: "running" },
      { column: "generation_started_at", value: expect.any(String) },
    ]);
  });
});

function fakeGenerationSupabase(options: { invalidCheckpoint?: boolean; currentCandidatesError?: string } = {}) {
  const transitions: string[] = [];
  const failureUpdates: Record<string, unknown>[] = [];
  const failureFilters: Array<{ column: string; value: string }> = [];
  const client = {
    from(table: string) {
      if (table === "checkpoint_generation_outbox") {
        return new GenerationQuery(
          transitions,
          failureUpdates,
          failureFilters,
          options.invalidCheckpoint ?? false,
          Boolean(options.currentCandidatesError),
        );
      }
      if (table === "session_activity_candidates" && options.currentCandidatesError) {
        return new FailingCandidatesQuery(options.currentCandidatesError);
      }
      throw new Error(`unexpected table ${table}`);
    },
  } as unknown as SupabaseClient;

  return { client, transitions, failureUpdates, failureFilters };
}

class GenerationQuery {
  private values: Record<string, unknown> = {};
  private filters: Array<{ column: string; value: string }> = [];

  constructor(
    private readonly transitions: string[],
    private readonly failureUpdates: Record<string, unknown>[],
    private readonly failureFilters: Array<{ column: string; value: string }>,
    private readonly invalidCheckpoint: boolean,
    private readonly hasGenerationWork: boolean,
  ) {}

  update(values: Record<string, unknown>) {
    this.values = values;
    if (typeof values.status === "string") this.transitions.push(values.status);
    return this;
  }

  eq(column: string, value: string) {
    this.filters.push({ column, value });
    return this;
  }

  select(_columns?: string) {
    return this;
  }

  maybeSingle() {
    return Promise.resolve({
      data: {
        curriculum_matches: !this.hasGenerationWork
          ? []
          : [{ objective_code: "L7.4.2", unit: "U4", grade: 7, subject: "lenguaje", text: "La noticia", similarity: 0.9 }],
        checkpoints: {
          session_id: "session-1",
          session_context: {},
          segment_ids: this.invalidCheckpoint ? [] : ["segment-1"],
          latest_lesson_state: {
            topic: "La noticia",
            objective_guess: "Reconocer sus partes",
            key_terms: ["titular"],
            transcript_summary: "La clase trabajo la noticia.",
            confidence: 0.9,
            evidence: { quoted_phrases: ["titular"], reason: "La clase lo explico." },
          },
        },
      },
      error: null,
    });
  }

  then<TResult1 = unknown, TResult2 = never>(
    onfulfilled?: ((value: unknown) => TResult1 | PromiseLike<TResult1>) | null,
    onrejected?: ((reason: unknown) => TResult2 | PromiseLike<TResult2>) | null,
  ) {
    if (this.values.status === "failed") {
      this.failureUpdates.push(this.values);
      this.failureFilters.push(...this.filters);
    }
    return Promise.resolve({ data: null, error: null }).then(onfulfilled, onrejected);
  }
}

class FailingCandidatesQuery {
  constructor(private readonly message: string) {}

  select(_columns: string) {
    return this;
  }

  eq(_column: string, _value: string) {
    return this;
  }

  order(_column: string, _options: { ascending: boolean }) {
    return this;
  }

  limit(_value: number) {
    return this;
  }

  then<TResult1 = unknown, TResult2 = never>(
    onfulfilled?: ((value: unknown) => TResult1 | PromiseLike<TResult1>) | null,
    onrejected?: ((reason: unknown) => TResult2 | PromiseLike<TResult2>) | null,
  ) {
    return Promise.resolve({ data: null, error: { message: this.message } }).then(onfulfilled, onrejected);
  }
}
