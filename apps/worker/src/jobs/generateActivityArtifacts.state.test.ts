import { describe, expect, it } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import { runGenerateActivityArtifactsJob } from "./generateActivityArtifacts.job.js";

describe("generateActivityArtifacts checkpoint state transitions", () => {
  it("claims a delivered handoff as running and completes it when there is no work", async () => {
    const transitions: string[] = [];
    const client = {
      from(table: string) {
        if (table !== "checkpoint_generation_outbox") throw new Error(`unexpected table ${table}`);
        return new GenerationQuery(transitions);
      },
    } as unknown as SupabaseClient;

    const result = await runGenerateActivityArtifactsJob(client, { checkpointId: "checkpoint-1" });

    expect(result.skippedReason).toBe("no curriculum matches");
    expect(transitions).toEqual(["running", "completed"]);
  });
});

class GenerationQuery {
  private values: Record<string, unknown> = {};

  constructor(private readonly transitions: string[]) {}

  update(values: Record<string, unknown>) {
    this.values = values;
    if (typeof values.status === "string") this.transitions.push(values.status);
    return this;
  }

  eq(_column: string, _value: string) {
    return this;
  }

  select(_columns?: string) {
    return this;
  }

  maybeSingle() {
    return Promise.resolve({
      data: {
        curriculum_matches: [],
        checkpoints: {
          session_id: "session-1",
          session_context: {},
          segment_ids: ["segment-1"],
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
    return Promise.resolve({ data: null, error: null }).then(onfulfilled, onrejected);
  }
}
