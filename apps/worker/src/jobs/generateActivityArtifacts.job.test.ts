import { describe, expect, it } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { LessonState } from "@kobi/ai-core";
import type { CurriculumMatch } from "@kobi/curriculum";
import {
  buildActivitySessionContext,
  ACTIVITY_ARTIFACT_CONTRACT_VERSION,
  ACTIVITY_SDK_VERSION,
  type ActivityArtifactCandidate,
  type ActivityManifest,
  type RankedActivityRepositoryRow,
} from "@kobi/activities/server";
import {
  planSessionArtifacts,
  refreshGenerateActivityArtifactsJobData,
  runGenerateActivityArtifactsJob,
} from "./generateActivityArtifacts.job.js";
describe("generateActivityArtifacts job planning", () => {
  it("refreshes stale queued lesson and curriculum data before generation", async () => {
    const latestLessonState: LessonState = {
      ...lessonState,
      topic: "Fracciones equivalentes",
      objective_guess: "Comparar fracciones equivalentes",
      transcript_summary: "La docente comparo medios, cuartos y octavos.",
      key_terms: ["fraccion", "equivalente", "cuartos"],
    };
    const supabase = fakeSupabase({ segments: [lessonState, latestLessonState] });
    const refreshedMatches: CurriculumMatch[] = [
      {
        objective_code: "M7.2.1",
        unit: "fracciones",
        grade: 7,
        subject: "matematicas",
        text: "Compara fracciones equivalentes.",
        similarity: 0.93,
      },
    ];
    let receivedQuery = "";

    const result = await refreshGenerateActivityArtifactsJobData(
      supabase.client,
      {
        sessionId: "session-1",
        lessonState,
        curriculumMatches,
        curriculumFallback: {
          classId: "class-1",
          grade: 7,
          subject: "matematicas",
          unit: "fracciones",
          sourceIds: ["source-selected"],
        },
      },
      async (_supabase, input) => {
        receivedQuery = input.queryText;
        expect(input).toMatchObject({
          grade: 7,
          subject: "matematicas",
          unit: "fracciones",
          sourceIds: ["source-selected"],
        });
        return refreshedMatches;
      },
    );

    expect(receivedQuery).toContain("Fracciones equivalentes");
    expect(result.lessonState).toEqual(latestLessonState);
    expect(result.curriculumMatches).toEqual(refreshedMatches);
  });

  it("generates from lesson_state when retrieval returns no curriculum matches", async () => {
    const supabase = fakeSupabase();
    let receivedMatches: CurriculumMatch[] = [];

    const result = await runGenerateActivityArtifactsJob(
      supabase.client,
      {
        sessionId: "session-1",
        lessonState,
        curriculumMatches: [],
        curriculumFallback: { grade: 7, subject: "matematicas", unit: "algebra" },
      },
      {
        openAiGenerator: async (input) => {
          receivedMatches = input.curriculumMatches;
          return { candidates: [], attempted: true, attempts: 1, errors: [] };
        },
      },
    );

    expect(result.inserted).toBe(3);
    expect(result.skippedReason).toBeNull();
    expect(receivedMatches).toEqual([
      expect.objectContaining({
        objective_code: "UNMAPPED_LESSON_STATE",
        grade: 7,
        subject: "matematicas",
        unit: "algebra",
        similarity: 0,
      }),
    ]);
    expect(supabase.insertedCandidates).toHaveLength(3);
    expect(supabase.rpcCalls).toContain("replace_session_activity_candidates");
  });

  it("uses one complete source set instead of mixing repository, OpenAI, and static bands", () => {
    const reusableSupport = repositoryRow("support", 0.92);
    const openAiCore = candidate("core", "openai-core");
    const staticCore = candidate("core", "static-core");
    const staticSupport = candidate("support", "static-support");
    const staticChallenge = candidate("challenge", "static-challenge");

    const planned = planSessionArtifacts({
      reusableSet: [reusableSupport],
      openAiCandidates: [openAiCore],
      staticCandidates: [staticSupport, staticCore, staticChallenge],
    });

    expect(planned).toHaveLength(3);
    expect(planned.every((artifact) => artifact.origin === "static")).toBe(true);
    expect(planned.map((artifact) => artifact.candidate?.activity_set_id)).toEqual([
      "set-test",
      "set-test",
      "set-test",
    ]);
  });

  it("accepts a complete exact-curriculum legacy repository set", () => {
    const legacySet = (["support", "core", "challenge"] as const).map((band) => ({
      ...repositoryRow(band, 0.9),
      activity_set_id: null,
    }));

    const planned = planSessionArtifacts({
      reusableSet: legacySet,
      openAiCandidates: [],
      staticCandidates: [],
    });

    expect(planned).toHaveLength(3);
    expect(planned.map((artifact) => artifact.reusable?.id)).toEqual([
      "activity-support",
      "activity-core",
      "activity-challenge",
    ]);
  });

  it("persists medium-match generations as adapted with parent lineage", async () => {
    const parent = repositoryRow("core", 0.6);
    const supabase = fakeSupabase({ repositoryRows: [parent] });

    const result = await runGenerateActivityArtifactsJob(
      supabase.client,
      {
        sessionId: "session-1",
        lessonState,
        curriculumMatches,
      },
      { openAiGenerator: null },
    );

    expect(result).toMatchObject({ inserted: 3, reused: 3, generated: 0 });
    expect(supabase.activityUpserts).toHaveLength(3);
    expect(supabase.activityUpserts.every((row) => row.source === "adapted")).toBe(true);
    expect(supabase.activityUpserts.every((row) => row.parent_id === parent.id)).toBe(true);
    expect(new Set(supabase.activityUpserts.map((row) => row.activity_set_id)).size).toBe(1);
  });

  it("falls back to static candidates when OpenAI generation throws", async () => {
    const supabase = fakeSupabase();
    let openAiCalls = 0;

    const result = await runGenerateActivityArtifactsJob(
      supabase.client,
      {
        sessionId: "session-1",
        lessonState,
        curriculumMatches,
      },
      {
        openAiGenerator: async () => {
          openAiCalls += 1;
          throw new Error("prompt file missing");
        },
      },
    );

    expect(openAiCalls).toBe(1);
    expect(result).toMatchObject({
      inserted: 3,
      reused: 0,
      generated: 0,
      skippedReason: null,
    });
    expect(supabase.insertedCandidates).toHaveLength(3);
    expect(supabase.bundleRefs.every((ref) => ref.startsWith("artifact-bundles/static/"))).toBe(true);
  });

  it("persists context snapshots from session lesson_state rows and evidence from curriculum matches", async () => {
    const earlierLessonState: LessonState = {
      ...lessonState,
      topic: "El titular de la noticia",
      objective_guess: "Reconocer titulares",
      key_terms: ["periodico", "titular"],
      confidence: 0.72,
      evidence: {
        quoted_phrases: ["titular corto"],
        reason: "La clase inicio con titulares.",
      },
    };
    const supabase = fakeSupabase({ segments: [earlierLessonState, lessonState] });

    const result = await runGenerateActivityArtifactsJob(
      supabase.client,
      {
        sessionId: "session-1",
        lessonState,
        curriculumMatches,
      },
      {
        openAiGenerator: null,
      },
    );

    expect(result.inserted).toBe(3);
    expect(supabase.insertedCandidates).toHaveLength(3);
    for (const insertedCandidate of supabase.insertedCandidates) {
      expect(insertedCandidate.context_snapshot).toMatchObject({
        latest_topic: lessonState.topic,
        segment_count: 2,
      });
      expect(insertedCandidate.context_snapshot.vocabulary).toEqual(
        expect.arrayContaining(["periodico", "titular", "entradilla", "fuente"]),
      );
      expect(insertedCandidate.evidence).toEqual([
        {
          objective_code: "L7.4.2",
          section: "U4 / L7.4.2",
          text: "Reconoce la estructura de la noticia: titular, entradilla, cuerpo y fuente.",
          similarity: 0.91,
        },
      ]);
    }
  });

  it("records failed OpenAI calls before fallback and enforces the per-session quota", async () => {
    const supabase = fakeSupabase();
    let openAiCalls = 0;

    const run = () =>
      runGenerateActivityArtifactsJob(
        supabase.client,
        {
          sessionId: "session-1",
          lessonState,
          curriculumMatches,
        },
        {
          openAiGenerator: async () => {
            openAiCalls += 1;
            throw new Error("review rejected the set");
          },
          maxOpenAiGenerationsPerSession: 1,
        },
      );

    await run();
    await run();

    expect(openAiCalls).toBe(1);
    expect(supabase.generationAttempts).toHaveLength(1);
    expect(supabase.generationAttempts[0]).toMatchObject({
      session_id: "session-1",
      provider: "openai",
    });
  });

});

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

function repositoryRow(
  band: "support" | "core" | "challenge",
  rankScore: number,
): RankedActivityRepositoryRow {
  return {
    id: `activity-${band}`,
    contract_version: ACTIVITY_ARTIFACT_CONTRACT_VERSION,
    manifest: manifest(band, `Reusable ${band}`),
    bundle_ref: `artifact-bundles/reusable-${band}/index.html`,
    evidence: [{ objective_code: "L7.4.2", section: "U4 / L7.4.2", text: "La noticia" }],
    parent_id: null,
    activity_set_id: "set-reusable",
    status: "verified",
    source: "seeded",
    verifier_scores: {
      deterministic: "pass",
      rubric: {
        curriculum_alignment: 0.95,
        age_fit: 0.9,
        duration_fit: 0.9,
        answer_correctness: 0.9,
        hint_leakage: 0.9,
        duplicate_risk: 0.8,
        spanish_suitability: 0.95,
      },
    },
    times_used: 1,
    avg_score: 0.8,
    rank_score: rankScore,
  };
}

function candidate(
  band: "support" | "core" | "challenge",
  refPart: string,
): ActivityArtifactCandidate {
  return {
    contract_version: ACTIVITY_ARTIFACT_CONTRACT_VERSION,
    manifest: manifest(band, `Candidate ${band}`),
    bundle_ref: `artifact-bundles/${refPart}/index.html`,
    bundle_html: "<!doctype html><html><script>activity-sdk/v1 postMessage getManifest getBand reportAttempt reportHint reportComplete</script><body>Candidate</body></html>",
    verifier_scores: {
      deterministic: "fail",
      rubric: {
        curriculum_alignment: 0,
        age_fit: 0,
        duration_fit: 0,
        answer_correctness: 0,
        hint_leakage: 0,
        duplicate_risk: 0,
        spanish_suitability: 0,
      },
    },
    evidence: [{ objective_code: "L7.4.2", section: "U4 / L7.4.2", text: "La noticia" }],
    parent_id: null,
    activity_set_id: "set-test",
    status: "candidate",
  };
}

function manifest(band: "support" | "core" | "challenge", title: string): ActivityManifest {
  return {
    family: "guided_practice" as const,
    mechanic: "source_check_desk" as const,
    title,
    difficulty_band: band,
    curriculum: {
      grade: 7,
      subject: "lenguaje",
      unit: "U4",
      objective: "L7.4.2",
    },
    est_minutes: 6,
    content: {
      items: [
        {
          prompt: "Responde sobre la noticia.",
          answer_key: ["titular"],
          hints: ["Busca la idea principal."],
        },
      ],
    },
    entry: "index.html" as const,
    sdk_version: ACTIVITY_SDK_VERSION,
    allowed_capabilities: ["dom", "css"],
    learning_design: {
      learning_goal: "Reconocer las partes de una noticia.",
      interaction_summary: "Revisar fuentes y evidencias.",
      success_criteria: ["Identifica la evidencia correcta."],
    },
    visual_theme: { scene: "mesa de fuentes", accent: "azul" },
  };
}

function fakeSupabase(options: {
  openAiAttemptCount?: number;
  segments?: LessonState[];
  repositoryRows?: RankedActivityRepositoryRow[];
  readyCandidates?: Array<{ difficulty_band: string; context_snapshot: unknown }>;
} = {}) {
  const insertedCandidates: Array<{
    context_snapshot: { latest_topic: string; vocabulary: string[]; segment_count: number };
    evidence: unknown;
  }> = [];
  const bundleRefs: string[] = [];
  const likeFilters: string[] = [];
  const inFilters: string[] = [];
  const activityUpserts: Array<Record<string, unknown>> = [];
  const generationAttempts: Array<Record<string, unknown>> = Array.from(
    { length: options.openAiAttemptCount ?? 0 },
    (_, index) => ({ id: `attempt-${index}`, session_id: "session-1", provider: "openai" }),
  );
  const rpcCalls: string[] = [];
  let nextActivityId = 0;
  const state: FakeQueryState = {
    insertedCandidates,
    bundleRefs,
    likeFilters,
    inFilters,
    nextActivityId: () => {
      nextActivityId += 1;
      return `activity-${nextActivityId}`;
    },
    generationAttempts,
    segments: options.segments ?? [],
    repositoryRows: options.repositoryRows ?? [],
    readyCandidates: options.readyCandidates ?? [],
    activityUpserts,
  };

  const client = {
    from(table: string) {
      return new FakeQuery(table, state);
    },
    async rpc(name: string, args: Record<string, unknown>) {
      rpcCalls.push(name);
      if (name === "claim_openai_activity_generation_attempt") {
        const limit = Number(args.input_limit);
        if (generationAttempts.length >= limit) return { data: false, error: null };
        generationAttempts.push({
          session_id: args.input_session_id,
          provider: "openai",
          activity_set_id: args.input_activity_set_id,
        });
        return { data: true, error: null };
      }
      if (name === "replace_session_activity_candidates") {
        const candidates = Array.isArray(args.input_candidates) ? args.input_candidates : [];
        insertedCandidates.splice(0, insertedCandidates.length, ...candidates);
      }
      return { data: null, error: null };
    },
  } as unknown as SupabaseClient;

  return {
    client,
    insertedCandidates,
    bundleRefs,
    likeFilters,
    inFilters,
    activityUpserts,
    generationAttempts,
    rpcCalls,
  };
}

interface FakeQueryState {
  insertedCandidates: unknown[];
  bundleRefs: string[];
  likeFilters: string[];
  inFilters: string[];
  nextActivityId: () => string;
  generationAttempts: Array<Record<string, unknown>>;
  segments: LessonState[];
  repositoryRows: RankedActivityRepositoryRow[];
  readyCandidates: Array<{ difficulty_band: string; context_snapshot: unknown }>;
  activityUpserts: Array<Record<string, unknown>>;
}

class FakeQuery {
  private operation: "select" | "insert" | "update" | "upsert" | null = null;
  private selected = "";
  private insertedValue: unknown;
  private upsertValue: Record<string, unknown> | null = null;

  constructor(
    private readonly table: string,
    private readonly state: FakeQueryState,
  ) {}

  select(value: string) {
    this.operation = "select";
    this.selected = value;
    return this;
  }

  insert(value: unknown) {
    this.operation = "insert";
    this.insertedValue = value;
    return this;
  }

  update() {
    this.operation = "update";
    return this;
  }

  upsert(value: Record<string, unknown>) {
    this.operation = "upsert";
    this.upsertValue = value;
    if (this.table === "activity_bundles" && typeof value.ref === "string") {
      this.state.bundleRefs.push(value.ref);
    }
    if (this.table === "activities") this.state.activityUpserts.push(value);
    return this;
  }

  eq() {
    return this;
  }

  overlaps() {
    return this;
  }

  in(column: string, values: string[]) {
    this.state.inFilters.push(`${column}=${values.join(",")}`);
    return this;
  }

  order() {
    return this;
  }

  limit() {
    return this;
  }

  like(column: string, pattern: string) {
    this.state.likeFilters.push(`${column}=${pattern}`);
    return this;
  }

  single() {
    if (this.table === "activities" && this.operation === "select") {
      return Promise.resolve({ data: { id: this.state.nextActivityId() }, error: null });
    }

    return Promise.resolve(this.result());
  }

  then<TResult1 = unknown, TResult2 = never>(
    onfulfilled?: ((value: unknown) => TResult1 | PromiseLike<TResult1>) | null,
    onrejected?: ((reason: unknown) => TResult2 | PromiseLike<TResult2>) | null,
  ) {
    return Promise.resolve(this.result()).then(onfulfilled, onrejected);
  }

  private result() {
    if (this.table === "segments") {
      return {
        data: this.state.segments.map((lessonState) => ({ lesson_state: lessonState })),
        error: null,
      };
    }

    if (this.table === "activities" && this.operation === "select") {
      return { data: this.state.repositoryRows, error: null };
    }

    if (this.table === "session_activity_candidates" && this.operation === "select") {
      return { data: this.state.readyCandidates, error: null };
    }

    if (this.table === "session_activity_candidates" && this.operation === "insert") {
      this.state.insertedCandidates.push(
        this.insertedValue as {
          context_snapshot: { latest_topic: string; vocabulary: string[]; segment_count: number };
          evidence: unknown;
        },
      );
      return { data: null, error: null };
    }

    if (this.operation === "upsert" || this.operation === "update") {
      return { data: null, error: null };
    }

    if (this.upsertValue) {
      return { data: null, error: null };
    }

    return { data: null, error: null };
  }
}

describe("generateActivityArtifacts skip guard", () => {
  it("skips regeneration when ready candidates match the current session context", async () => {
    const contextSnapshot = buildActivitySessionContext([lessonState]);
    const supabase = fakeSupabase({
      segments: [lessonState],
      readyCandidates: [
        { difficulty_band: "support", context_snapshot: contextSnapshot },
        { difficulty_band: "core", context_snapshot: contextSnapshot },
        { difficulty_band: "challenge", context_snapshot: contextSnapshot },
      ],
    });

    const result = await runGenerateActivityArtifactsJob(supabase.client, {
      sessionId: "session-1",
      lessonState,
      curriculumMatches,
    });

    expect(result.skippedReason).toBe("ready candidates are current");
    expect(result.inserted).toBe(0);
    expect(supabase.insertedCandidates).toHaveLength(0);
    expect(supabase.rpcCalls).not.toContain("replace_session_activity_candidates");
  });

  it("regenerates when material session context changes", async () => {
    const previousSnapshot = buildActivitySessionContext([lessonState]);
    const changedLessonState: LessonState = {
      ...lessonState,
      topic: "El editorial",
      key_terms: ["editorial", "opinion"],
    };
    const supabase = fakeSupabase({
      segments: [changedLessonState],
      readyCandidates: [
        { difficulty_band: "support", context_snapshot: previousSnapshot },
        { difficulty_band: "core", context_snapshot: previousSnapshot },
        { difficulty_band: "challenge", context_snapshot: previousSnapshot },
      ],
    });

    const result = await runGenerateActivityArtifactsJob(supabase.client, {
      sessionId: "session-1",
      lessonState: changedLessonState,
      curriculumMatches,
    });

    expect(result.skippedReason).not.toBe("ready candidates are current");
    expect(result.inserted).toBeGreaterThan(0);
    expect(supabase.rpcCalls).toContain("replace_session_activity_candidates");
  });
});

