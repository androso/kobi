import { google } from "@ai-sdk/google";
import { embed } from "ai";

export type EmbeddingTaskType = "RETRIEVAL_DOCUMENT" | "RETRIEVAL_QUERY";

/**
 * Single embedding call, reused for both curriculum-chunk ingestion
 * (retrieval_document) and live lesson_state queries (retrieval_query).
 * Gemini's embedding model supports distinct task types for each, which
 * measurably improves retrieval quality over using one generic embedding.
 */
export async function embedText(text: string, taskType: EmbeddingTaskType): Promise<number[]> {
  const { embedding } = await embed({
    model: google.textEmbeddingModel("text-embedding-004", { taskType }),
    value: text,
  });

  return embedding;
}
