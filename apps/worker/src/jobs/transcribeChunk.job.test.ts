import type { SupabaseClient } from "@supabase/supabase-js";
import type PgBoss from "pg-boss";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { transcribeAudioChunk } from "@kobi/ai-core";
import { registerTranscribeChunkJob, type TranscribeChunkJobData } from "./transcribeChunk.job.js";

vi.mock("@kobi/ai-core", () => ({
  classifySafeError: vi.fn(() => "transcription_error"),
  safeLog: vi.fn(),
  transcribeAudioChunk: vi.fn(),
}));

describe("transcribeChunk job", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns retryable failures to pending instead of exposing them as terminal", async () => {
    vi.mocked(transcribeAudioChunk).mockRejectedValueOnce(new Error("temporary provider failure"));
    const updates: Array<Record<string, unknown>> = [];
    const handler = await registerHandler(updates);

    await expect(handler([jobWithRetryMetadata({ retryCount: 0, retryLimit: 2 })]))
      .rejects.toThrow("temporary provider failure");

    expect(updates).toEqual([
      { status: "transcribing" },
      { status: "pending" },
    ]);
  });

  it("marks a chunk failed only when the final retry attempt fails", async () => {
    vi.mocked(transcribeAudioChunk).mockRejectedValueOnce(new Error("terminal provider failure"));
    const updates: Array<Record<string, unknown>> = [];
    const handler = await registerHandler(updates);

    await expect(handler([jobWithRetryMetadata({ retryCount: 2, retryLimit: 2 })]))
      .rejects.toThrow("terminal provider failure");

    expect(updates).toEqual([
      { status: "transcribing" },
      { status: "failed" },
    ]);
  });
});

async function registerHandler(updates: Array<Record<string, unknown>>) {
  let registeredHandler:
    | ((jobs: PgBoss.JobWithMetadata<TranscribeChunkJobData>[]) => Promise<unknown>)
    | undefined;
  const boss = {
    work: vi.fn(async (_name, options, handler) => {
      expect(options).toMatchObject({ batchSize: 1, includeMetadata: true });
      registeredHandler = handler;
      return "worker-1";
    }),
  } as unknown as PgBoss;
  const supabase = {
    from: vi.fn(() => ({
      update(value: Record<string, unknown>) {
        updates.push(value);
        return {
          eq: vi.fn(async () => ({ error: null })),
        };
      },
    })),
  } as unknown as SupabaseClient;

  await registerTranscribeChunkJob(boss, supabase);
  if (!registeredHandler) throw new Error("transcribeChunk handler was not registered");
  return registeredHandler;
}

function jobWithRetryMetadata({
  retryCount,
  retryLimit,
}: {
  retryCount: number;
  retryLimit: number;
}) {
  return {
    id: "job-1",
    name: "transcribe-chunk",
    data: {
      audioChunkId: "chunk-1",
      audioUrl: "https://example.test/audio.wav",
      mimeType: "audio/wav",
      sessionId: "session-1",
    },
    retryCount,
    retryLimit,
  } as PgBoss.JobWithMetadata<TranscribeChunkJobData>;
}
