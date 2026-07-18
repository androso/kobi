import { describe, expect, it } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import type PgBoss from "pg-boss";
import type { LessonState } from "@kobi/ai-core";
import type { CurriculumMatch } from "@kobi/curriculum";
import {
  buildGenerateActivityArtifactsJobData,
  runEvaluateCheckpointJob,
} from "./evaluateCheckpoint.job.js";
import { JOB_GENERATE_ACTIVITY_ARTIFACTS } from "../queue.js";

const lessonState: LessonState = {
  topic: "La noticia y sus partes",
  objective_guess: "Identificar titular, entradilla y fuente en una noticia breve",
  key_terms: ["titular", "entradilla", "fuente"],
  transcript_summary: "La docente explico la noticia.",
  confidence: 0.88,
  evidence: {
    quoted_phrases: ["titular de la noticia"],
    reason: "La clase se centro en reconocer partes de una noticia.",
  },
};

const curriculumMatches: CurriculumMatch[] = [
  {
    objective_code: "L7.4.2",
    unit: "U4",
    grade: 7,
    subject: "lenguaje",
    text: "Reconoce la estructura de la noticia: titular, entradilla, cuerpo y fuente.",
    similarity: 0.91,
  },
];

describe("evaluateCheckpoint job", () => {
  it("builds the Area C job payload from structured lesson state and curriculum matches only", () => {
    expect(
      buildGenerateActivityArtifactsJobData({
        sessionId: "session-1",
        lessonState,
        curriculumMatches,
        curriculumFallback: {
          classId: "class-1",
          grade: 7,
          subject: "lenguaje",
          sourceIds: ["source-selected"],
        },
      }),
    ).toEqual({
      sessionId: "session-1",
      lessonState,
      curriculumMatches,
      curriculumFallback: {
        classId: "class-1",
        grade: 7,
        subject: "lenguaje",
        sourceIds: ["source-selected"],
      },
    });
  });

  it("does nothing when there are no new segments since the last ready checkpoint", async () => {
    const supabase = fakeSupabase({ lastReadyCheckpointAt: "2026-01-01T00:00:00Z", segments: [] });
    const boss = fakeBoss();

    const result = await runEvaluateCheckpointJob(
      supabase.client,
      boss.instance,
      { sessionId: "session-1" },
      {
        evaluator: async () => {
          throw new Error("evaluator should not be called when there is nothing new");
        },
      },
    );

    expect(result).toEqual({
      evaluated: false,
      ready: null,
      skippedReason: "no new segments since last checkpoint",
    });
    expect(boss.sent).toHaveLength(0);
    expect(supabase.insertedCheckpoints).toHaveLength(0);
  });

  it("records a not-ready checkpoint and does not enqueue generation", async () => {
    const supabase = fakeSupabase({ lastReadyCheckpointAt: null, segments: [lessonState] });
    const boss = fakeBoss();

    const result = await runEvaluateCheckpointJob(
      supabase.client,
      boss.instance,
      { sessionId: "session-1" },
      {
        evaluator: async () => ({ ready: false, reason: "Falta material.", summary: "Aun poco contenido." }),
      },
    );

    expect(result).toEqual({ evaluated: true, ready: false, skippedReason: null });
    expect(supabase.insertedCheckpoints).toHaveLength(1);
    expect(supabase.insertedCheckpoints[0]).toMatchObject({
      session_id: "session-1",
      ready: false,
      reason: "Falta material.",
    });
    expect(boss.sent).toHaveLength(0);
  });

  it("records a ready checkpoint, retrieves curriculum matches, and enqueues generate-activity-artifacts", async () => {
    const supabase = fakeSupabase({ lastReadyCheckpointAt: null, segments: [lessonState] });
    const boss = fakeBoss();
    let retrieverCalls = 0;
    const retrieverInputs: Array<{ queryText: string; grade: number; subject: string; unit?: string }> = [];

    const result = await runEvaluateCheckpointJob(
      supabase.client,
      boss.instance,
      { sessionId: "session-1" },
      {
        evaluator: async () => ({ ready: true, reason: "Suficiente material.", summary: "Se enseno la noticia." }),
        curriculumRetriever: async (_supabase, input) => {
          retrieverCalls += 1;
          retrieverInputs.push(input);
          return curriculumMatches;
        },
      },
    );

    expect(result).toEqual({ evaluated: true, ready: true, skippedReason: null });
    expect(retrieverCalls).toBe(1);
    const retrieverInput = retrieverInputs[0];
    expect(retrieverInput).toMatchObject({
      grade: 7,
      subject: "lenguaje",
    });
    expect(retrieverInput.queryText).toContain(lessonState.objective_guess);
    expect(retrieverInput.queryText).toContain(lessonState.topic);
    expect(retrieverInput.queryText).toContain("titular");
    expect(retrieverInput.queryText).toContain(lessonState.transcript_summary);
    expect(supabase.insertedCheckpoints[0]).toMatchObject({ session_id: "session-1", ready: true });
    expect(boss.sent).toHaveLength(1);
    expect(boss.sent[0].name).toBe(JOB_GENERATE_ACTIVITY_ARTIFACTS);
    expect(boss.sent[0].data).toMatchObject({
      sessionId: "session-1",
      lessonState,
      curriculumMatches,
      curriculumFallback: expect.objectContaining({ sourceIds: [] }),
    });
    expect(boss.sent[0].options).toEqual({ singletonKey: "session-1" });
  });

  it("uses session class metadata for curriculum retrieval when job data omits it", async () => {
    const supabase = fakeSupabase({
      lastReadyCheckpointAt: null,
      segments: [lessonState],
      classContext: { grade: 7, subject: "matematicas", unit: "geometria-triangulos-cuadrilateros" },
    });
    const boss = fakeBoss();
    const retrieverInputs: Array<{ queryText: string; grade: number; subject: string; unit?: string }> = [];

    await runEvaluateCheckpointJob(
      supabase.client,
      boss.instance,
      { sessionId: "session-1" },
      {
        evaluator: async () => ({ ready: true, reason: "Suficiente material.", summary: "Listo." }),
        curriculumRetriever: async (_supabase, input) => {
          retrieverInputs.push(input);
          return curriculumMatches;
        },
      },
    );

    expect(retrieverInputs[0]).toMatchObject({
      grade: 7,
      subject: "matematicas",
      unit: "geometria-triangulos-cuadrilateros",
    });
  });


  it("only loads segments created after the last ready checkpoint", async () => {
    const supabase = fakeSupabase({ lastReadyCheckpointAt: "2026-01-01T00:05:00Z", segments: [lessonState] });
    const boss = fakeBoss();

    await runEvaluateCheckpointJob(
      supabase.client,
      boss.instance,
      { sessionId: "session-1" },
      { evaluator: async () => ({ ready: false, reason: "x", summary: "y" }) },
    );

    expect(supabase.segmentsGtValue).toBe("2026-01-01T00:05:00Z");
  });

  it("never queries raw audio chunks while evaluating the checkpoint handoff", async () => {
    const supabase = fakeSupabase({ lastReadyCheckpointAt: null, segments: [lessonState] });
    const boss = fakeBoss();

    await runEvaluateCheckpointJob(
      supabase.client,
      boss.instance,
      { sessionId: "session-1" },
      {
        evaluator: async () => ({ ready: true, reason: "Suficiente material.", summary: "Se enseno la noticia." }),
        curriculumRetriever: async () => curriculumMatches,
      },
    );

    expect(supabase.tablesRead).toEqual(["checkpoints", "segments", "checkpoints", "sessions"]);
    expect(supabase.tablesRead).not.toContain("audio_chunks");
  });
});

interface FakeSupabaseOptions {
  lastReadyCheckpointAt: string | null;
  segments: LessonState[];
  classContext?: { grade: number; subject: string; unit: string } | null;
}

function fakeSupabase(options: FakeSupabaseOptions) {
  const insertedCheckpoints: unknown[] = [];
  const state = { segmentsGtValue: null as string | null, tablesRead: [] as string[] };

  const client = {
    from(table: string) {
      state.tablesRead.push(table);
      if (table === "checkpoints") {
        return new CheckpointsQuery(options.lastReadyCheckpointAt, insertedCheckpoints);
      }
      if (table === "segments") {
        return new SegmentsQuery(options.segments, state);
      }
      if (table === "sessions") {
        return new SessionsQuery(options.classContext ?? null);
      }
      throw new Error(`fakeSupabase: unexpected table ${table}`);
    },
  } as unknown as SupabaseClient;

  return {
    client,
    insertedCheckpoints,
    get segmentsGtValue() {
      return state.segmentsGtValue;
    },
    get tablesRead() {
      return state.tablesRead;
    },
  };
}

class SessionsQuery {
  constructor(private readonly classContext: FakeSupabaseOptions["classContext"]) {}

  select() {
    return this;
  }

  eq() {
    return this;
  }

  maybeSingle() {
    return Promise.resolve({
      data: { classes: this.classContext },
      error: null,
    });
  }
}

class CheckpointsQuery {
  constructor(
    private readonly lastReadyCheckpointAt: string | null,
    private readonly insertedCheckpoints: unknown[],
  ) {}

  select() {
    return this;
  }

  insert(value: unknown) {
    this.insertedCheckpoints.push(value);
    return this;
  }

  eq() {
    return this;
  }

  order() {
    return this;
  }

  limit() {
    return this;
  }

  maybeSingle() {
    return Promise.resolve({
      data: this.lastReadyCheckpointAt ? { created_at: this.lastReadyCheckpointAt } : null,
      error: null,
    });
  }

  then<TResult1 = unknown, TResult2 = never>(
    onfulfilled?: ((value: { data: null; error: null }) => TResult1 | PromiseLike<TResult1>) | null,
    onrejected?: ((reason: unknown) => TResult2 | PromiseLike<TResult2>) | null,
  ) {
    return Promise.resolve({ data: null, error: null }).then(onfulfilled, onrejected);
  }
}

class SegmentsQuery {
  constructor(
    private readonly segments: LessonState[],
    private readonly state: { segmentsGtValue: string | null },
  ) {}

  select() {
    return this;
  }

  eq() {
    return this;
  }

  order() {
    return this;
  }

  gt(_column: string, value: string) {
    this.state.segmentsGtValue = value;
    return this;
  }

  then<TResult1 = unknown, TResult2 = never>(
    onfulfilled?: ((value: { data: unknown[]; error: null }) => TResult1 | PromiseLike<TResult1>) | null,
    onrejected?: ((reason: unknown) => TResult2 | PromiseLike<TResult2>) | null,
  ) {
    const data = this.segments.map((lessonState) => ({ lesson_state: lessonState }));
    return Promise.resolve({ data, error: null }).then(onfulfilled, onrejected);
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
