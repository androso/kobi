# packages/curriculum

Area B: Curriculum & Retrieval.

**Contract:** textbook unit + `lesson_state` → top matching curriculum objectives/chunks.

Scope: ingestion, chunking, embedding, pgvector retrieval. Curriculum chunks should be atomic, objective-level, ~150-300 tokens — smaller than generic RAG defaults, because selective retrieval matters more than broad semantic similarity for standards/objectives.

Implemented v0 choices: hand-authored objective-level chunks, OpenAI
`text-embedding-3-small` with 768 dimensions, Supabase pgvector retrieval through
`match_curriculum_chunks`, grade/subject/unit metadata filters, and a structured
ingestion function for one unit.

Status: **partial/environment-dependent**. Ingestion, chunking, embedding, and pgvector retrieval are implemented. The pipeline needs real textbook unit data under `content/curriculum` plus `OPENAI_API_KEY` to produce meaningful matches in a no-mock demo. The embedding model can be overridden with `OPENAI_EMBEDDING_MODEL`.
