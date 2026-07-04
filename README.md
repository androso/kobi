# Kobi

AI agent that assists classrooms in El Salvador.

Kobi v0 turns the last 10 minutes of any class into a personalized, curriculum-grounded activity block — with zero teacher prep. Full loop: **Listen → Understand → Propose → Approve → Deliver → Measure.**

Full spec: [`docs/product-spec.md`](docs/product-spec.md) · Team contracts: [`docs/contracts.md`](docs/contracts.md)

## Stack

TypeScript everywhere: one Next.js app (teacher + student portals + API routes, single deploy on Vercel), one Node worker (background AI pipeline, on Railway/Fly), Supabase (Postgres + pgvector + Realtime + Auth) as the single datastore. No Python/FastAPI — see decision D3/D8 in the product spec.

## Structure

```
kobi/
├─ apps/
│  ├─ web/                  # Next.js: teacher portal + student portal + API routes — ONE deploy
│  └─ worker/                # transcription, lesson-state builder, pre-gen, verifier, variant maker
├─ packages/
│  ├─ db/                    # Supabase schema/migrations + shared TS types (7-8 tables)
│  ├─ ai-core/                # model routing: transcription/lesson-state/planner/verifier/variant models
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
| C. Activity Generation & Quality | Androso | `lesson_state` + curriculum + repository → 3 verified candidate activities |
| D. Teacher Experience | Mauricio | approval flow, evidence UI, session report |
| E. Student Experience & Activity Engine | Mauricio | activity player, hints, results |
| F. Platform & Data Backbone | Androso | auth, storage, realtime, background jobs |

## Quickstart

Scaffolding is placeholder-only right now (every folder has a README describing its contract). Once real tooling lands:

```bash
pnpm install
cp .env.example .env   # fill in Supabase + model API keys
pnpm dev
```

## Contracts

Agree these shared contracts first, then build in parallel — see [`docs/contracts.md`](docs/contracts.md):

1. `lesson_state`
2. `ActivityArtifact` (verified HTML bundle + manifest)
3. Telemetry event
