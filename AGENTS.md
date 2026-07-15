# Agent Instructions

## Project Context

Kobi is an AI classroom assistant for El Salvador. The v0 loop is:
Listen -> Understand -> Propose -> Approve -> Deliver -> Measure.

Use `README.md`, `docs/product-spec.md`, and `docs/contracts.md` as the source of truth before changing behavior or data shapes.
This file is guidance for coding agents only; it must not expand MVP scope or override the product spec or contracts.

## Stack

- Use TypeScript throughout the repo.
- `apps/web` is the Vite + React app for teacher and student portals.
- `apps/worker` is the Node worker for background AI pipeline work.
- Supabase is the datastore: Postgres, pgvector, Realtime, and Auth.
- Do not introduce Python/FastAPI unless the product spec changes.
- Use pnpm and the existing workspace layout under `apps/*` and `packages/*`.

## Working Guidelines

- Keep changes scoped to the package or app that owns the behavior.
- Prefer shared contracts and validators over duplicated JSON shape assumptions.
- Treat `prompts/` as runtime-tunable prompt and rubric content, not application code.
- Preserve the ownership boundaries described in `README.md`.
- When adding scripts or tooling, wire them through the workspace in a way that works from the repo root.

## Context and Token Efficiency

- Start with `git status --short`, then use `rg`/`rg --files` to inspect only the files relevant to the request. Do not recursively reread the repository.
- Read `README.md`, `docs/product-spec.md`, and `docs/contracts.md` selectively: use `rg` to locate the relevant sections, and expand only when changing behavior or data shapes.
- Prefer current repository state over old task transcripts or rollout summaries. Consult memory only for a concrete prior decision, error, branch, or path that is relevant to the task.
- Load a skill or external connector only when the request requires that capability. Prefer local `git`, `rg`, and narrow package commands for ordinary repository work.
- Do not use subagents for a task that is small or sequential. When delegation is explicitly requested, give each agent a bounded, independent subtask and avoid duplicate repository scans.
- Run the narrowest relevant validation first. Escalate to workspace-wide typechecking or both test suites only when the change crosses package boundaries or the narrow check reveals a broader risk.
- Keep progress updates and final reports concise: report decisions, changed files, validation, and blockers without replaying command output or restating the full task.

## Validation

- Run the narrowest relevant checks for the files you change.
- If no real check exists yet, state that clearly and avoid inventing placeholder tests.
- For contract changes, update the docs and any schema or type definitions together.

## Cursor Cloud specific instructions

The startup update script only runs `pnpm install` (pnpm 10+, Node 22). There is no lint tooling; `pnpm typecheck` (`tsc --noEmit`, workspace-wide) is the static gate. Tests are Vitest: `pnpm --filter @kobi/web test` and `pnpm --filter @kobi/worker test`.

Non-obvious facts:

- The frontend `apps/web` is **Vite + React** (not Next.js). Env vars are read from the repo-root `.env`/`.env.local` (Vite `envDir` is the repo root); browser-exposed vars must be `VITE_*`. Root `pnpm dev` starts **only** the web app (port 5173); the worker/API (`apps/worker`, port 8787) must be started separately with `pnpm --filter @kobi/worker dev`.
- Runtime deps are external managed services provided via secrets: a Supabase project (`VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `DATABASE_URL`) plus model keys (`OPENAI_API_KEY`, `GEMINI_API_KEY`). The worker **fails fast at startup** if `OPENAI_API_KEY` is missing (checkpoint evaluator config is validated during job registration), so it cannot boot without a model key even though the actual API calls are lazy. Teacher signup + class creation only touch Supabase (Auth + PostgREST), not the model keys.
- Migrations live in `packages/db`: `pnpm --filter @kobi/db db:migrate` runs Drizzle migrations + idempotent raw SQL (`packages/db/migrations/*.sql`) and creates the `vector` extension. The raw SQL depends on the Supabase stack (`auth.uid()`, `anon`/`authenticated` roles), so it targets a Supabase database, not plain Postgres.
- To run fully offline without a hosted project, a local Supabase stack works (`supabase start` via the Supabase CLI + Docker; point `DATABASE_URL` at `:54322` and set `VITE_SUPABASE_URL`/keys from `supabase status -o env`). Gotcha: after running the Drizzle migrations against a fresh local DB, the `anon`/`authenticated` roles have **no table grants** (hosted Supabase applies these via default privileges), so PostgREST returns `permission denied for table classes`. Fix once with `grant all on all tables/sequences/routines in schema public to anon, authenticated, service_role;` plus matching `alter default privileges`. Also create the `audio-chunks` storage bucket.
