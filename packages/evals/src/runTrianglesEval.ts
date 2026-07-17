import { mkdir, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { config } from "dotenv";
import { Client } from "langsmith/client";
import { evaluate } from "langsmith/evaluation";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import {
  createRetrievalEvaluators,
  loadEvaluationFixture,
  scoreRetrieval,
  type EvaluationFixture,
  type RelevantPage,
} from "./evaluations.js";
import { ensureRetrievalDataset } from "./ensureRetrievalDataset.js";
import { createTracedCurriculumRetriever, type CurriculumRagClassContext } from "./tracedCurriculumRag.js";

interface SourceRetrievalContext extends CurriculumRagClassContext {
  chunkCount: number;
  availablePages: number[];
}

interface SourceChunkRow {
  grade: unknown;
  subject: unknown;
  unit: unknown;
  source_page_start: unknown;
}

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../../..");
config({ path: resolve(repoRoot, ".env.local") });
config({ path: resolve(repoRoot, ".env") });

const fixture = await loadEvaluationFixture(
  resolve(repoRoot, "packages/evals/fixtures/triangles-quadrilaterals.json"),
);

const sourceId = requireEnv("EVAL_SOURCE_ID");
const supabaseUrl = process.env.VITE_SUPABASE_URL?.trim() || requireEnv("SUPABASE_URL");
const serviceRoleKey = requireEnv("SUPABASE_SERVICE_ROLE_KEY");
requireEnv("OPENAI_API_KEY");
requireEnv("LANGSMITH_API_KEY");
if (process.env.LANGSMITH_TRACING?.trim().toLowerCase() !== "true") {
  throw new Error("run:triangles requires LANGSMITH_TRACING=true");
}
if (!process.env.LANGSMITH_PROJECT?.trim()) {
  process.env.LANGSMITH_PROJECT = "kobi-evals";
}

const supabase = createClient(supabaseUrl, serviceRoleKey);
const client = new Client();
const retrievalContext = await resolveSourceRetrievalContext(
  supabase,
  sourceId,
  fixture.relevantPages,
);
const retrievalFixture = withRetrievalContext(fixture, retrievalContext);
const dataset = await ensureRetrievalDataset(client, retrievalFixture);

const { target, retrieve } = createTracedCurriculumRetriever({
  supabase,
  classContext: retrievalContext,
  sourceIds: [sourceId],
  matchCount: 3,
  projectName: process.env.LANGSMITH_PROJECT,
});

const experiment = await evaluate(target, {
  data: dataset.datasetName,
  client,
  experimentPrefix: "kobi-rag-triangles",
  metadata: {
    fixture_id: fixture.id,
    source_id: sourceId,
    match_count: 3,
    input_mode: "gold_lesson_state",
    eval_kind: "curriculum-retrieval",
    retrieval_grade: retrievalContext.grade,
    retrieval_subject: retrievalContext.subject,
    retrieval_unit: retrievalContext.unit,
    source_chunk_count: retrievalContext.chunkCount,
    source_available_pages: retrievalContext.availablePages,
    dataset_created: dataset.created,
    dataset_updated: dataset.updated,
  },
  evaluators: createRetrievalEvaluators(retrievalFixture),
});

try {
  for await (const _result of experiment) {
    // Consuming the iterator ensures evaluator feedback is submitted before exit.
  }
} finally {
  await client.awaitPendingTraceBatches();
}

const retrieval = await retrieve(retrievalFixture.goldLessonState);
await client.awaitPendingTraceBatches();

const report = {
  fixtureId: fixture.id,
  langsmith: {
    datasetName: dataset.datasetName,
    experimentName: experiment.experimentName,
    project: process.env.LANGSMITH_PROJECT,
  },
  retrievalContext,
  retrievalScore: scoreRetrieval(retrievalFixture, retrieval.matches),
  retrievedPages: retrieval.matches,
};

const outputDir = resolve(repoRoot, "packages/evals/tmp/results");
await mkdir(outputDir, { recursive: true });
await writeFile(
  resolve(outputDir, `${fixture.id}-${Date.now()}.json`),
  `${JSON.stringify(report, null, 2)}\n`,
  "utf8",
);
console.info(JSON.stringify({ experiment: experiment.experimentName, report }, null, 2));

function requireEnv(name: string) {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`run:triangles requires ${name}`);
  return value;
}

function withRetrievalContext(
  fixture: EvaluationFixture,
  retrievalContext: SourceRetrievalContext,
): EvaluationFixture {
  return {
    ...fixture,
    classContext: {
      grade: retrievalContext.grade,
      subject: retrievalContext.subject,
      unit: retrievalContext.unit,
    },
  };
}

async function resolveSourceRetrievalContext(
  supabase: SupabaseClient,
  sourceId: string,
  relevantPages: RelevantPage[],
): Promise<SourceRetrievalContext> {
  const { data, count, error } = await supabase
    .from("curriculum_chunks")
    .select("grade,subject,unit,source_page_start", { count: "exact" })
    .eq("source_id", sourceId)
    .range(0, 9999);

  if (error) {
    throw new Error(`run:triangles failed to load EVAL_SOURCE_ID chunks: ${error.message}`);
  }

  const rows = (data ?? []) as SourceChunkRow[];
  const row = rows[0];
  if (!row) {
    throw new Error("run:triangles EVAL_SOURCE_ID has no curriculum_chunks rows");
  }

  if (!isPositiveInteger(row.grade) || typeof row.subject !== "string" || typeof row.unit !== "string") {
    throw new Error("run:triangles EVAL_SOURCE_ID chunk metadata is incomplete");
  }

  const grade = row.grade;
  const subject = row.subject.trim();
  const unit = row.unit.trim();
  if (!subject || !unit) {
    throw new Error("run:triangles EVAL_SOURCE_ID chunk subject/unit metadata is empty");
  }

  const availablePages = [...new Set(rows.flatMap((item) => (
    isPositiveInteger(item.source_page_start) ? [item.source_page_start] : []
  )))].sort((left, right) => left - right);
  const availablePageSet = new Set(availablePages);
  const missingPages = relevantPages
    .map((item) => item.page)
    .filter((page, index, pages) => pages.indexOf(page) === index)
    .filter((page) => !availablePageSet.has(page));
  if (missingPages.length > 0) {
    throw new Error(
      `run:triangles EVAL_SOURCE_ID is missing fixture relevant page(s) in curriculum_chunks.source_page_start: ${missingPages.join(", ")}`,
    );
  }

  return {
    grade,
    subject,
    unit,
    chunkCount: count ?? rows.length,
    availablePages,
  };
}

function isPositiveInteger(value: unknown): value is number {
  return Number.isInteger(value) && typeof value === "number" && value > 0;
}
