import { describe, expect, it } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { LessonState } from "@kobi/ai-core";
import type { CurriculumMatch } from "@kobi/curriculum";
import {
  ACTIVITY_ARTIFACT_CONTRACT_VERSION,
  ACTIVITY_SDK_VERSION,
  type ActivityArtifactCandidate,
  type ActivityManifest,
  type RankedActivityRepositoryRow,
} from "@kobi/activities";
import {
  planSessionArtifacts,
  runGenerateActivityArtifactsJob,
} from "./generateActivityArtifacts.job.js";

describe("generateActivityArtifacts job planning", () => {
  it("skips generation when retrieval returns no curriculum matches", async () => {
    const supabase = fakeSupabase();

    const result = await runGenerateActivityArtifactsJob(
      supabase.client,
      {
        sessionId: "session-1",
        lessonState,
        curriculumMatches: [],
      },
      {
        openAiGenerator: async () => {
          throw new Error("generator should not be called without curriculum matches");
        },
      },
    );

    expect(result).toEqual({
      inserted: 0,
      reused: 0,
      generated: 0,
      skippedReason: "no curriculum matches",
    });
    expect(supabase.insertedCandidates).toHaveLength(0);
  });

  it("uses reusable activities first, OpenAI candidates for missing bands, then static fallback", () => {
    const reusableSupport = repositoryRow("support", 0.92);
    const openAiCore = candidate("core", "openai-core");
    const staticCore = candidate("core", "static-core");
    const staticChallenge = candidate("challenge", "static-challenge");

    const planned = planSessionArtifacts({
      reusableByBand: { support: reusableSupport },
      openAiCandidates: [openAiCore],
      staticCandidates: [staticCore, staticChallenge],
    });

    expect(planned).toHaveLength(3);
    expect(planned[0].reusable?.id).toBe("activity-support");
    expect(planned[1].candidate?.bundle_ref).toBe("artifact-bundles/openai-core/index.html");
    expect(planned[1].origin).toBe("openai");
    expect(planned[2].candidate?.bundle_ref).toBe("artifact-bundles/static-challenge/index.html");
    expect(planned[2].origin).toBe("static");
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

  it("counts only OpenAI bundle refs against the per-session OpenAI quota", async () => {
    const supabase = fakeSupabase({ openAiGenerationCount: 3 });
    let openAiCalls = 0;

    await runGenerateActivityArtifactsJob(
      supabase.client,
      {
        sessionId: "session-1",
        lessonState,
        curriculumMatches,
      },
      {
        openAiGenerator: async () => {
          openAiCalls += 1;
          return { candidates: [candidate("core", "openai-core")], attempted: true, attempts: 1, errors: [] };
        },
        maxOpenAiGenerationsPerSession: 3,
      },
    );

    expect(openAiCalls).toBe(0);
    expect(supabase.likeFilters).toContain("activities.bundle_ref=artifact-bundles/openai/%");
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
    status: "candidate",
  };
}

function manifest(band: "support" | "core" | "challenge", title: string): ActivityManifest {
  return {
    family: "guided_practice" as const,
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
  };
}

function fakeSupabase(options: { openAiGenerationCount?: number; segments?: LessonState[] } = {}) {
  const insertedCandidates: Array<{
    context_snapshot: { latest_topic: string; vocabulary: string[]; segment_count: number };
    evidence: unknown;
  }> = [];
  const bundleRefs: string[] = [];
  const likeFilters: string[] = [];
  let nextActivityId = 0;

  const client = {
    from(table: string) {
      return new FakeQuery(table, {
        insertedCandidates,
        bundleRefs,
        likeFilters,
        nextActivityId: () => {
          nextActivityId += 1;
          return `activity-${nextActivityId}`;
        },
        openAiGenerationCount: options.openAiGenerationCount ?? 0,
        segments: options.segments ?? [],
      });
    },
  } as unknown as SupabaseClient;

  return { client, insertedCandidates, bundleRefs, likeFilters };
}

interface FakeQueryState {
  insertedCandidates: unknown[];
  bundleRefs: string[];
  likeFilters: string[];
  nextActivityId: () => string;
  openAiGenerationCount: number;
  segments: LessonState[];
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
    return this;
  }

  eq() {
    return this;
  }

  overlaps() {
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
      return { data: [], error: null };
    }

    if (this.table === "session_activity_candidates" && this.operation === "select") {
      if (this.selected.includes("activities!inner")) {
        return {
          data: Array.from({ length: this.state.openAiGenerationCount }, (_, index) => ({
            id: `candidate-${index}`,
            activities: { bundle_ref: `artifact-bundles/openai/${index}/index.html` },
          })),
          error: null,
        };
      }

      return { data: [], error: null };
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
