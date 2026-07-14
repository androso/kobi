# Kobi

AI agent that assists classrooms in El Salvador.

Kobi v0 turns the last 10 minutes of any class into a personalized, curriculum-grounded activity block — with zero teacher prep. Full loop: **Listen → Understand → Propose → Approve → Deliver → Measure.**

Full spec: [`docs/product-spec.md`](docs/product-spec.md) · Team contracts: [`docs/contracts.md`](docs/contracts.md)

## Stack

TypeScript everywhere: one Vite + React frontend (teacher + student portals), one Node worker/API backend (background AI pipeline, on Railway/Fly), Supabase (Postgres + pgvector + Realtime + Auth) as the single datastore. No Python/FastAPI — see decision D3/D8 in the product spec.

## Structure

```
kobi/
├─ apps/
│  ├─ web/                  # Vite + React: teacher portal + student portal
│  └─ worker/                # transcription, lesson-state builder, pre-gen, verifier, banded artifacts
├─ packages/
│  ├─ db/                    # Supabase schema/migrations + shared TS types (7-8 tables)
│  ├─ ai-core/                # model routing: transcription/lesson-state/planner/verifier/banding models
│  ├─ curriculum/            # ingestion, chunking, embedding, pgvector retrieval (Area B)
│  ├─ activities/            # artifact manifest schema + verifier + sandbox SDK (Area C — shared by web + worker)
│  └─ evals/                 # eval harness/runner code
├─ prompts/                  # per-stage prompt/rubric text, tuned without redeploying ai-core
├─ content/                  # pre-ingested textbook unit + 5 hand-seeded activities
├─ docs/
└─ infra/
```

## Ownership areas

| Area | Owner | Mission |
|---|---|---|
| A. Listening & Understanding | Isaac | mic audio → rolling `lesson_state` |
| B. Curriculum & Retrieval | Isaac | textbook + `lesson_state` → matching objectives/chunks |
| C. Activity Generation & Quality | Androso | `lesson_state` + curriculum + repository → verified support/core/challenge `ActivityArtifact`s |
| D. Teacher Experience | Mauricio | approval flow, evidence UI, session report |
| E. Student Experience & Activity Engine | Mauricio | activity player, hints, results |
| F. Platform & Data Backbone | Androso | auth, storage, realtime, background jobs |

## Quickstart

```bash
pnpm install
cp .env.example .env   # fill in Supabase + model API keys
pnpm dev               # starts only the web app (port 5173)
pnpm --filter @kobi/worker dev   # start the worker/API separately (port 8787)
```

## Implementation status

| Area | Status | Notes |
|---|---|---|
| Web app (`apps/web`) | **shipped** | Teacher + student portals implemented; runs standalone with Supabase credentials. |
| Worker/API (`apps/worker`) | **partial/environment-dependent** | Transcription, lesson-state builder, checkpoint evaluator, and activity-generation pipeline are wired; model credentials and a running Supabase DB are required for the full loop. |
| Database (`packages/db`) | **shipped** | Drizzle schema + migrations for all v0 tables; apply with `pnpm --filter @kobi/db db:migrate`. |
| AI core (`packages/ai-core`) | **shipped** | Audio transcription, `lesson_state` schema/builder, and manual fallback. |
| Curriculum (`packages/curriculum`) | **partial/environment-dependent** | Ingestion, embedding, and pgvector retrieval implemented; needs real textbook unit data in `content/curriculum` for meaningful matches. |
| Activities (`packages/activities`) | **shipped** | Artifact manifest schema, verifier, static/OpenAI candidate generation, and SDK contracts. |
| Evals (`packages/evals`) | **planned** | Harness design documented; no runner implemented yet. |

## Contracts

Agree these shared contracts first, then build in parallel — see [`docs/contracts.md`](docs/contracts.md):

1. `lesson_state`
2. `ActivityArtifact` (verified HTML bundle + manifest)
3. Telemetry event
