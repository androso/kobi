# packages/curriculum

Area B: Curriculum & Retrieval.

**Contract:** textbook unit + `lesson_state` → top matching curriculum objectives/chunks.

Scope: ingestion, chunking, embedding, pgvector retrieval. Curriculum chunks should be atomic, objective-level, ~150-300 tokens — smaller than generic RAG defaults, because selective retrieval matters more than broad semantic similarity for standards/objectives.

Key calls left to the owner: chunking granularity, embedding model, metadata filters, ingestion tooling.

Status: placeholder — no ingestion pipeline yet.
