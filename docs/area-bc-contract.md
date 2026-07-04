# Area B <-> Area C contract

For Androso (Area C — Activity Generation & Quality), from Isaac (Area A — Listening & Understanding, Area B — Curriculum & Retrieval). Stack is fully TypeScript throughout, per D3/D8 in `docs/product-spec.md` — no Python anywhere in this repo.

## What you get from Area B

`retrieveCurriculumMatches()` (`packages/curriculum/src/retrieveCurriculumMatches.ts`) returns `CurriculumMatch[]` — the curriculum evidence your planner grounds activities in:

```ts
interface CurriculumMatch {
  objective_code: string;
  unit: string;
  grade: number;
  subject: string;
  text: string;
  similarity: number; // cosine similarity, 0-1, higher is better
}
```

Example response (top-3, per the product spec's "pgvector top-3 + metadata filters, sync" retrieval mode):

```json
[
  {
    "objective_code": "L7.4.2",
    "unit": "U4",
    "grade": 7,
    "subject": "lenguaje",
    "text": "El sustantivo es la palabra que nombra personas, lugares, animales u objetos...",
    "similarity": 0.83
  }
]
```

Type is exported from `@kobi/curriculum` — import it directly rather than redefining it in `packages/activities`.

## How retrieval gets triggered

You don't need to call this yourself in the MVP flow — `apps/worker/src/jobs/buildLessonState.job.ts` calls it automatically every time a new `lesson_state` is built (rolling, ~2 min cadence) and confidence is >= 0.5. Low-confidence `lesson_state` skips retrieval entirely, so you won't get called with weak/noisy evidence.

If you need retrieval on-demand (e.g. re-running for a specific unit at "Hora de actividad" time), call `retrieveCurriculumMatches(supabase, { queryText, grade, subject, unit })` directly — it's a plain async function, not queue-only.

## This contract doesn't change based on the artifact family

Gate 0 now ratifies verified HTML `ActivityArtifact`s as v0, but the curriculum evidence Area C consumes is still the same `CurriculumMatch[]` shape. Area B doesn't need to know which artifact family is rendered — match/classify, sequence/order, or guided practice/checkpoint — and Area C should build its planner against this contract.

## `lesson_state` (upstream of Area B, in case your planner also wants it directly)

Area A's output — see `docs/contracts.md` for the full shape (`topic`, `objective_guess`, `key_terms`, `transcript_summary`, `confidence`, `evidence`). Your planner likely wants both `lesson_state` (for phrasing/context) and `CurriculumMatch[]` (for grounding) as generation inputs, matching the product spec's contract for Area C: `lesson_state + curriculum chunks + repository -> 3 verified candidate ActivityArtifacts`.

## Tech choices on the B side, for context

- **Embeddings**: Gemini `text-embedding-004`, using separate `retrieval_document` (ingestion) and `retrieval_query` (live lesson queries) task types — one vendor, matches the transcription model choice.
- **Vector store**: Supabase pgvector, cosine distance, `ivfflat` index — fine at this corpus size (one textbook unit).
- **Chunking**: hand-authored, one chunk per objective code, ~150-300 tokens — no PDF-parsing pipeline for the hackathon.

None of this should matter to how you build Area C — it's here so you know why the contract looks the way it does.
