# packages/curriculum

Area B: Curriculum & Retrieval.

**Contract:** textbook unit + `lesson_state` → top matching curriculum objectives/chunks.

Scope: ingestion, chunking, embedding, pgvector retrieval. Curriculum chunks should be atomic, objective-level, ~150-300 tokens — smaller than generic RAG defaults, because selective retrieval matters more than broad semantic similarity for standards/objectives.

Implemented v0 choices: hand-authored objective-level chunks, Gemini
`text-embedding-004`, Supabase pgvector retrieval through `match_curriculum_chunks`,
grade/subject/unit metadata filters, and a structured ingestion function for one unit.

Status: code path is implemented, but `content/curriculum` still needs the real textbook
unit data before the no-mock demo can retrieve meaningful matches.
