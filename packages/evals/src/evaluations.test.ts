import { fileURLToPath } from "node:url";
import { describe, expect, it, vi } from "vitest";

vi.mock("@kobi/curriculum", () => ({
  buildCurriculumQueryText: vi.fn(() => "triángulos lados vértices"),
  retrieveCurriculumMatches: vi.fn(async () => [
    {
      source_id: "source-1",
      grade: 2,
      subject: "matemática",
      unit: "U3",
      source_page_start: 90,
      source_page_end: 90,
      objective_code: "U3.1",
      text: "Un triángulo tiene tres lados",
      similarity: 0.91,
      source_document: "libro-matematica.pdf",
    },
  ]),
}));

import { buildCurriculumQueryText, retrieveCurriculumMatches } from "@kobi/curriculum";
import {
  createRetrievalEvaluators,
  loadEvaluationFixture,
  sanitizeCurriculumMatches,
  scoreRetrieval,
} from "./evaluations.js";
import { ensureRetrievalDataset } from "./ensureRetrievalDataset.js";
import { createTracedCurriculumRetriever } from "./tracedCurriculumRag.js";

const fixturePath = fileURLToPath(new URL("../fixtures/triangles-quadrilaterals.json", import.meta.url));
const fixture = await loadEvaluationFixture(fixturePath);

function emptyExamples() {
  return (async function* () {})();
}

describe("RAG evaluation metrics", () => {
  it("rewards primary-page coverage, rejects duplicate page citations, and computes deterministic ranking metrics", () => {
    const score = scoreRetrieval(fixture, [
      { sourcePageStart: 90 },
      { sourcePageStart: 90 },
      { sourcePageStart: 93 },
    ]);

    expect(score.weightedRecallAt3).toBe(0.5);
    expect(score.precisionAt3).toBeCloseTo(2 / 3);
    expect(score.meanReciprocalRank).toBe(1);
    expect(score.nDCGAt3).toBeCloseTo(0.629379, 5);
    expect(score.distinctRelevantPages).toBe(2);
    expect(Object.keys(score)).toEqual([
      "weightedRecallAt3",
      "precisionAt3",
      "meanReciprocalRank",
      "nDCGAt3",
      "distinctRelevantPages",
    ]);
  });

  it("returns zeros when no retrieved page is relevant", () => {
    expect(scoreRetrieval(fixture, [{ sourcePageStart: 88 }])).toEqual({
      weightedRecallAt3: 0,
      precisionAt3: 0,
      meanReciprocalRank: 0,
      nDCGAt3: 0,
      distinctRelevantPages: 0,
    });
  });

  it("strips curriculum text and source document from traced matches", () => {
    const sanitized = sanitizeCurriculumMatches([
      {
        objective_code: "U3.1",
        similarity: 0.91,
        source_page_start: 88,
        source_page_end: 89,
        text: "Un triángulo tiene tres lados",
        source_document: "libro-matematica.pdf",
      },
    ]);

    expect(sanitized).toEqual([
      {
        sourcePageStart: 88,
        sourcePageEnd: 89,
        objectiveCode: "U3.1",
        similarity: 0.91,
      },
    ]);
    expect(JSON.stringify(sanitized)).not.toContain("triángulo");
    expect(JSON.stringify(sanitized)).not.toContain("libro-matematica.pdf");
  });

  it("emits only the retained LangSmith retrieval feedback keys", () => {
    const [evaluator] = createRetrievalEvaluators(fixture);
    const feedback = evaluator({
      outputs: {
        matches: [
          { sourcePageStart: 90, objectiveCode: "U3.1", similarity: 0.9 },
          { sourcePageStart: 93, objectiveCode: "U3.2", similarity: 0.8 },
        ],
      },
    });

    expect(feedback.map((item) => item.key)).toEqual([
      "weighted_recall_at_3",
      "precision_at_3",
      "mrr",
      "ndcg_at_3",
    ]);
  });
});

describe("ensureRetrievalDataset", () => {
  it("creates a one-example dataset when missing", async () => {
    const createExample = vi.fn().mockResolvedValue({ id: "ex-1" });
    const client = {
      hasDataset: vi.fn().mockResolvedValue(false),
      createDataset: vi.fn().mockResolvedValue({ id: "ds-1" }),
      createExample,
      readDataset: vi.fn(),
      listExamples: vi.fn().mockReturnValue(emptyExamples()),
      updateExample: vi.fn(),
      deleteExample: vi.fn(),
    };

    const result = await ensureRetrievalDataset(client as never, fixture);

    expect(result).toMatchObject({
      datasetId: "ds-1",
      datasetName: `kobi-${fixture.id}`,
      created: true,
      updated: true,
      exampleCount: 1,
    });
    expect(createExample).toHaveBeenCalledWith(
      expect.objectContaining({
        dataset_id: "ds-1",
        inputs: expect.objectContaining({
          lessonState: expect.objectContaining({ topic: fixture.goldLessonState.topic }),
          classContext: fixture.classContext,
        }),
        outputs: expect.objectContaining({ caseId: fixture.id, relevantPages: fixture.relevantPages }),
        metadata: expect.objectContaining({
          case_id: fixture.id,
          case_kind: "manual_fixture",
          source_pages: [90, 92, 91, 93],
        }),
      }),
    );
  });

  it("updates the existing example by fixture ID", async () => {
    async function* examples() {
      yield { id: "ex-stale", metadata: {} };
      yield { id: "ex-existing", metadata: { case_id: fixture.id } };
    }
    const updateExample = vi.fn().mockResolvedValue({});
    const deleteExample = vi.fn().mockResolvedValue(undefined);
    const client = {
      hasDataset: vi.fn().mockResolvedValue(true),
      createDataset: vi.fn(),
      createExample: vi.fn(),
      readDataset: vi.fn().mockResolvedValue({ id: "ds-1" }),
      listExamples: vi.fn().mockReturnValue(examples()),
      updateExample,
      deleteExample,
    };

    const result = await ensureRetrievalDataset(client as never, fixture);

    expect(result).toMatchObject({ created: false, updated: true, datasetId: "ds-1", exampleCount: 1 });
    expect(updateExample).toHaveBeenCalledWith(
      expect.objectContaining({
        id: "ex-existing",
        dataset_id: "ds-1",
        outputs: expect.objectContaining({ caseId: fixture.id, relevantPages: fixture.relevantPages }),
      }),
    );
    expect(deleteExample).toHaveBeenCalledWith("ex-stale");
  });
});

describe("loadEvaluationFixture", () => {
  it("strictly parses the retained triangles fixture", async () => {
    const loaded = await loadEvaluationFixture(fixturePath);

    expect(loaded.id).toBe("grade-2-triangles-quadrilaterals-001");
    expect(loaded.relevantPages).toEqual([
      { page: 90, relevance: "primary" },
      { page: 92, relevance: "primary" },
      { page: 91, relevance: "supporting" },
      { page: 93, relevance: "supporting" },
    ]);
    expect(loaded.goldLessonState.topic).toBe("Triángulos y cuadriláteros");
  });
});

describe("createTracedCurriculumRetriever", () => {
  it("passes the built query and configured source scope to the production retriever", async () => {
    vi.mocked(buildCurriculumQueryText).mockReturnValueOnce("mock query text");
    vi.mocked(retrieveCurriculumMatches).mockResolvedValueOnce([
      {
        source_id: "source-1",
        grade: 2,
        subject: "matemática",
        unit: "U3",
        source_page_start: 92,
        source_page_end: 93,
        objective_code: "U3.2",
        text: "Cuadriláteros",
        similarity: 0.84,
        source_document: "libro.pdf",
      },
    ]);
    const supabase = { rpc: vi.fn() };
    const { target } = createTracedCurriculumRetriever({
      supabase: supabase as never,
      classContext: fixture.classContext,
      sourceIds: ["source-1"],
      matchCount: 3,
      projectName: "kobi-evals-test",
    });

    const result = await target({ lessonState: fixture.goldLessonState });

    expect(buildCurriculumQueryText).toHaveBeenCalledWith(fixture.goldLessonState);
    expect(retrieveCurriculumMatches).toHaveBeenCalledWith(supabase, {
      queryText: "mock query text",
      grade: fixture.classContext.grade,
      subject: fixture.classContext.subject,
      unit: fixture.classContext.unit,
      sourceIds: ["source-1"],
      matchCount: 3,
    });
    expect(result).toEqual({
      queryText: "mock query text",
      matches: [
        {
          sourcePageStart: 92,
          sourcePageEnd: 93,
          objectiveCode: "U3.2",
          similarity: 0.84,
        },
      ],
      matchCount: 1,
    });
  });
});
