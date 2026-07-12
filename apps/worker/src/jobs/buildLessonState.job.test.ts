import { describe, expect, it, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { LessonState } from "@kobi/ai-core";
import { processBuildLessonStateJob } from "./buildLessonState.job.js";

const state: LessonState = {
  topic: "La noticia",
  objective_guess: "Identificar sus partes",
  key_terms: ["titular"],
  transcript_summary: "La docente explicó el titular.",
  confidence: 0.9,
  evidence: { quoted_phrases: ["el titular"], reason: "Explicación directa" },
};

describe("processBuildLessonStateJob", () => {
  it("finalizes a claimed contiguous range once with real class context", async () => {
    const client = fakeClient([claim({ from_chunk_index: 0, to_chunk_index: 1 }), true]);
    const builder = vi.fn().mockResolvedValue(state);

    await expect(processBuildLessonStateJob(client, "session-1", builder)).resolves.toBe("processed");
    expect(builder).toHaveBeenCalledWith(expect.objectContaining({
      transcriptText: "chunk zero\nchunk one",
      classContext: { grade: 7, subject: "lenguaje", unit: "U4", locale: "es-SV" },
    }));
    expect(client.rpc).toHaveBeenLastCalledWith("finalize_lesson_state_range", expect.objectContaining({
      target_claim_id: "claim-1",
    }));
  });

  it("ignores duplicate or stale finalization", async () => {
    const client = fakeClient([claim({}), false]);
    await expect(processBuildLessonStateJob(client, "session-1", vi.fn().mockResolvedValue(state))).resolves.toBe("stale");
  });

  it("waits when a missing chunk prevents a contiguous claim", async () => {
    const client = fakeClient([[], true]);
    const builder = vi.fn();
    await expect(processBuildLessonStateJob(client, "session-1", builder)).resolves.toBe("waiting");
    expect(builder).not.toHaveBeenCalled();
  });

  it("waits when an out-of-order later chunk cannot advance the range", async () => {
    const client = fakeClient([[], true]);
    await expect(processBuildLessonStateJob(client, "session-1", vi.fn())).resolves.toBe("waiting");
    expect(client.rpc).toHaveBeenCalledTimes(1);
  });

  it("persists a bounded zero-confidence state for silence without calling the model", async () => {
    const client = fakeClient([claim({ transcript_text: "   " }), true]);
    const builder = vi.fn();
    await expect(processBuildLessonStateJob(client, "session-1", builder)).resolves.toBe("silent");
    expect(builder).not.toHaveBeenCalled();
    expect(client.rpc).toHaveBeenLastCalledWith("finalize_lesson_state_range", expect.objectContaining({
      new_confidence: 0,
    }));
  });

  it("passes the previous state so a topic change is evaluated without regressing history", async () => {
    const previous = { ...state, topic: "El sustantivo" };
    const client = fakeClient([claim({ previous_lesson_state: previous }), true]);
    const builder = vi.fn().mockResolvedValue({ ...state, topic: "La noticia" });
    await processBuildLessonStateJob(client, "session-1", builder);
    expect(builder).toHaveBeenCalledWith(expect.objectContaining({ previousLessonState: previous }));
  });

  it("fails explicitly when class context is missing or malformed", async () => {
    const client = fakeClient([[{ ...claim({})[0], unit: null }]]);
    await expect(processBuildLessonStateJob(client, "session-1", vi.fn())).rejects.toThrow("missing or invalid class/range context");
  });
});

function claim(overrides: Record<string, unknown>) {
  return [{
    claim_id: "claim-1",
    from_chunk_index: 0,
    to_chunk_index: 1,
    transcript_text: "chunk zero\nchunk one",
    previous_lesson_state: null,
    grade: 7,
    subject: "lenguaje",
    unit: "U4",
    locale: "es-SV",
    ...overrides,
  }];
}

function fakeClient(results: unknown[]): SupabaseClient & { rpc: ReturnType<typeof vi.fn> } {
  const rpc = vi.fn();
  for (const data of results) rpc.mockResolvedValueOnce({ data, error: null });
  return { rpc } as unknown as SupabaseClient & { rpc: ReturnType<typeof vi.fn> };
}
