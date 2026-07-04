# Agent Instructions

## Project Context

Kobi is an AI classroom assistant for El Salvador. The v0 loop is:
Listen -> Understand -> Propose -> Approve -> Deliver -> Measure.

Use `README.md`, `docs/product-spec.md`, and `docs/contracts.md` as the source of truth before changing behavior or data shapes.
This file is guidance for coding agents only; it must not expand MVP scope or override the product spec or contracts.

## Stack

- Use TypeScript throughout the repo.
- `apps/web` is the Next.js app for teacher and student portals plus API routes.
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

## Validation

- Run the narrowest relevant checks for the files you change.
- If no real check exists yet, state that clearly and avoid inventing placeholder tests.
- For contract changes, update the docs and any schema or type definitions together.
