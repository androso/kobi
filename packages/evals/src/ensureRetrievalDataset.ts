import type { Client } from "langsmith";
import {
  toSanitizedLessonState,
  type EvaluationFixture,
} from "./evaluations.js";

export interface EnsureRetrievalDatasetResult {
  datasetId: string;
  datasetName: string;
  created: boolean;
  updated: boolean;
  exampleCount: number;
}

interface RetrievalDatasetExample {
  inputs: {
    lessonState: ReturnType<typeof toSanitizedLessonState>;
    classContext: EvaluationFixture["classContext"];
  };
  outputs: {
    caseId: string;
    relevantPages: EvaluationFixture["relevantPages"];
  };
  metadata: {
    fixture_id: string;
    case_id: string;
    case_kind: "manual_fixture";
    source_id: "manual-fixture";
    source_pages: number[];
    grade: number;
    subject: string;
    unit: string;
  };
}

/**
 * Ensures the curriculum-retrieval dataset exists and contains the fixture example.
 * Updates the existing example when fixture content changes.
 */
export async function ensureRetrievalDataset(
  client: Client,
  fixture: EvaluationFixture,
): Promise<EnsureRetrievalDatasetResult> {
  const datasetName = `kobi-${fixture.id}`;
  const example: RetrievalDatasetExample = {
    inputs: {
      lessonState: toSanitizedLessonState(fixture.goldLessonState),
      classContext: fixture.classContext,
    },
    outputs: {
      caseId: fixture.id,
      relevantPages: fixture.relevantPages,
    },
    metadata: {
      fixture_id: fixture.id,
      case_id: fixture.id,
      case_kind: "manual_fixture",
      source_id: "manual-fixture",
      source_pages: fixture.relevantPages.map((item) => item.page),
      grade: fixture.classContext.grade,
      subject: fixture.classContext.subject,
      unit: fixture.classContext.unit,
    },
  };

  const exists = await client.hasDataset({ datasetName });
  const dataset = exists
    ? await client.readDataset({ datasetName })
    : await client.createDataset(datasetName, { description: "Sanitized Kobi curriculum-retrieval evaluation." });

  let existingExampleId: string | null = null;
  const staleExampleIds: string[] = [];
  for await (const candidate of client.listExamples({ datasetId: dataset.id, limit: 100 })) {
    const metadata =
      candidate.metadata && typeof candidate.metadata === "object"
        ? (candidate.metadata as Record<string, unknown>)
        : {};
    if (metadata.case_id === fixture.id) {
      existingExampleId = candidate.id;
    } else {
      staleExampleIds.push(candidate.id);
    }
  }

  for (const staleExampleId of staleExampleIds) {
    await client.deleteExample(staleExampleId);
  }

  if (!existingExampleId) {
    await client.createExample({
      dataset_id: dataset.id,
      inputs: example.inputs,
      outputs: example.outputs,
      metadata: example.metadata,
    });
  } else {
    await client.updateExample({
      id: existingExampleId,
      dataset_id: dataset.id,
      inputs: example.inputs,
      outputs: example.outputs,
      metadata: example.metadata,
    });
  }

  return {
    datasetId: dataset.id,
    datasetName,
    created: !exists,
    updated: true,
    exampleCount: 1,
  };
}
