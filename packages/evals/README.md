# packages/evals

Evaluation harness for Kobi’s curriculum retrieval path. The retained live case is the reviewed grade 2 Matemática, Unit U3, “Conozcamos los triángulos y cuadriláteros” fixture.

## What it measures

The live command measures retrieval behavior only:

1. **Dataset**: `fixtures/triangles-quadrilaterals.json` provides one reviewed `goldLessonState`, class context, and labeled relevant textbook pages.
2. **Target**: `createTracedCurriculumRetriever()` wraps the production `@kobi/curriculum` query/retrieval path with nested LangSmith spans:
   - `build_curriculum_query` — `lesson_state` → query text
   - `retrieve_curriculum_matches` — OpenAI embedding + Supabase `match_curriculum_chunks` top-3
3. **Evaluators**: deterministic retrieval feedback keys:
   - `weighted_recall_at_3`
   - `precision_at_3`
   - `mrr`
   - `ndcg_at_3`

The runner uses real Supabase source metadata for grade, subject, and unit. It preflights `EVAL_SOURCE_ID` before creating a LangSmith experiment: the source must have chunks, non-empty metadata, and every labeled fixture page must exist in `curriculum_chunks.source_page_start`.

## Retained fixture

`packages/evals/fixtures/triangles-quadrilaterals.json` is a hand-reviewed retrieval fixture. It keeps transcript and gold lesson-state fields as fixture metadata, but `pnpm evals:triangles` uses only `goldLessonState`, class context, and `relevantPages` at runtime.

The fixture treats pages 90 and 92 as primary evidence, and pages 91 and 93 as supporting evidence.

## Commands

```sh
pnpm test:evals
pnpm evals:triangles
```

`pnpm test:evals` is deterministic helper coverage. It does not call OpenAI, Supabase, or LangSmith, so it does not prove retrieval effectiveness.

`pnpm evals:triangles` is the real Supabase/OpenAI/LangSmith smoke harness. It creates or updates the one-example LangSmith dataset, runs the traced retrieval experiment, and writes a local sanitized report under `packages/evals/tmp/results/`.

## LangSmith traces

Live runs require `LANGSMITH_TRACING=true` and post:

- experiment prefix: `kobi-rag-triangles`
- nested child spans for `build_curriculum_query` and `retrieve_curriculum_matches`
- retrieval outputs with page/objective/similarity metadata only; no chunk `text` or `source_document`

Optional: `LANGSMITH_PROJECT` defaults to `kobi-evals`.

## Required env for live retrieval

```env
OPENAI_API_KEY=
LANGSMITH_API_KEY=
LANGSMITH_TRACING=true
SUPABASE_SERVICE_ROLE_KEY=
VITE_SUPABASE_URL=
# or SUPABASE_URL=
EVAL_SOURCE_ID=
```

`EVAL_SOURCE_ID` must point at the ingested curriculum source whose pages match the retained fixture labels.
