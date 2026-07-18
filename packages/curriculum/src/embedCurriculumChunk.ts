import { createOpenAI } from "@ai-sdk/openai";
import { embed } from "ai";

export type EmbeddingTaskType = "RETRIEVAL_DOCUMENT" | "RETRIEVAL_QUERY";
const DEFAULT_EMBEDDING_MODEL = "text-embedding-3-small";
const EMBEDDING_DIMENSIONS = 768;

/**
 * Single embedding call, reused for both curriculum-chunk ingestion
 * (retrieval_document) and live lesson_state queries (retrieval_query).
 * Both paths must use the same model and dimensions because their vectors are
 * compared directly by the match_curriculum_chunks pgvector function.
 */
export async function embedText(text: string, taskType: EmbeddingTaskType): Promise<number[]> {
  const apiKey = process.env.OPENAI_API_KEY?.trim();
  if (!apiKey) {
    throw new Error("embedText: OPENAI_API_KEY is required for curriculum embeddings");
  }
  const model = process.env.OPENAI_EMBEDDING_MODEL?.trim() || DEFAULT_EMBEDDING_MODEL;
  console.info("[curriculumEmbedding] requesting embedding", {
    provider: "openai",
    model,
    dimensions: EMBEDDING_DIMENSIONS,
    taskType,
    textChars: text.length,
  });
  const openai = createOpenAI({ apiKey });
  const { embedding } = await embed({
    model: openai.textEmbeddingModel(model, { dimensions: EMBEDDING_DIMENSIONS }),
    value: text,
  });

  console.info("[curriculumEmbedding] embedding received", {
    provider: "openai",
    model,
    dimensions: embedding.length,
    taskType,
  });
  return embedding;
}
