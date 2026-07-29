import type { SupabaseClient } from "@supabase/supabase-js";
import type PgBoss from "pg-boss";
import { describe, expect, it } from "vitest";
import {
  JOB_BUILD_LESSON_STATE,
  JOB_EVALUATE_CHECKPOINT,
} from "../queue.js";
import { runFinalizeSessionJob } from "./finalizeSession.job.js";

describe("finalizeSession job", () => {
  it("forces a final checkpoint after transcription and lesson-state progress finish", async () => {
    const boss = fakeBoss();
    const result = await runFinalizeSessionJob(
      fakeSupabase({
        chunks: [
          { chunk_index: 0, status: "transcribed" },
          { chunk_index: 1, status: "failed" },
        ],
        progress: 1,
      }),
      boss.instance,
      { sessionId: "session-1" },
      0,
      10,
    );

    expect(result).toEqual({ checkpointEnqueued: true, usedPartialContext: false });
    expect(boss.sent).toEqual([{
      name: JOB_EVALUATE_CHECKPOINT,
      data: { sessionId: "session-1", trigger: "session_end", force: true },
      options: {
        singletonKey: "session-1:final",
        retryLimit: 3,
        retryDelay: 10,
        retryBackoff: true,
      },
    }]);
  });

  it("retries while transcription is unfinished", async () => {
    const boss = fakeBoss();
    await expect(runFinalizeSessionJob(
      fakeSupabase({ chunks: [{ chunk_index: 0, status: "transcribing" }], progress: null }),
      boss.instance,
      { sessionId: "session-1" },
      0,
      10,
    )).rejects.toThrow("still being transcribed");
    expect(boss.sent).toEqual([]);
  });

  it("wakes the lesson-state builder before retrying finalization", async () => {
    const boss = fakeBoss();
    await expect(runFinalizeSessionJob(
      fakeSupabase({ chunks: [{ chunk_index: 0, status: "transcribed" }], progress: null }),
      boss.instance,
      { sessionId: "session-1" },
      0,
      10,
    )).rejects.toThrow("lesson_state is at chunk none of 0");
    expect(boss.sent[0]).toEqual({
      name: JOB_BUILD_LESSON_STATE,
      data: { sessionId: "session-1" },
      options: { singletonKey: "session-1" },
    });
  });

  it("uses the available partial context when the retry budget is exhausted", async () => {
    const boss = fakeBoss();
    const result = await runFinalizeSessionJob(
      fakeSupabase({ chunks: [{ chunk_index: 2, status: "transcribed" }], progress: 1 }),
      boss.instance,
      { sessionId: "session-1" },
      10,
      10,
    );
    expect(result.usedPartialContext).toBe(true);
    expect(boss.sent.map((job) => job.name)).toEqual([
      JOB_BUILD_LESSON_STATE,
      JOB_EVALUATE_CHECKPOINT,
    ]);
  });
});

function fakeBoss() {
  const sent: Array<{ name: string; data: unknown; options: unknown }> = [];
  return {
    sent,
    instance: {
      send: async (name: string, data: unknown, options: unknown) => {
        sent.push({ name, data, options });
        return "job-id";
      },
    } as unknown as PgBoss,
  };
}

function fakeSupabase(input: {
  chunks: Array<{ chunk_index: number; status: string }>;
  progress: number | null;
}) {
  return {
    from(table: string) {
      if (table === "audio_chunks") {
        const query = {
          select: () => query,
          eq: () => query,
          order: async () => ({ data: input.chunks, error: null }),
        };
        return query;
      }
      const query = {
        select: () => query,
        eq: () => query,
        not: () => query,
        order: () => query,
        limit: () => query,
        maybeSingle: async () => ({
          data: input.progress === null
            ? null
            : { source_through_chunk_index: input.progress },
          error: null,
        }),
      };
      return query;
    },
  } as unknown as SupabaseClient;
}
