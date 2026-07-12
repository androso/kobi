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

The v0 implementation includes the Vite teacher/student portals, Supabase-backed auth and delivery, the worker HTTP/queue pipeline, transcription and lesson-state jobs, checkpoint evaluation, curriculum retrieval, activity generation/verification, teacher approval, sandboxed student delivery, and telemetry. Runtime use still requires Supabase plus model credentials; the repository does not include production deployment configuration, real curriculum content, or a completed eval harness. See [`docs/product-spec.md`](docs/product-spec.md#implementation-status) for the shipped, partial, demo-only, planned, and production-dependent boundaries.

To run the web app:

```bash
pnpm install
cp .env.example .env   # fill in Supabase + model API keys
pnpm dev
```

Start the worker/API separately with `pnpm --filter @kobi/worker dev`. Run `pnpm check:repo` before committing; intentional generated files and demo-data boundaries are recorded in [`docs/repository-hygiene.md`](docs/repository-hygiene.md).

## Contracts

Agree these shared contracts first, then build in parallel — see [`docs/contracts.md`](docs/contracts.md):

1. `lesson_state`
2. `ActivityArtifact` (verified HTML bundle + manifest)
3. Telemetry event
