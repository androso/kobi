# apps/web

Vite + React + TypeScript app: teacher portal + student portal.

## Screens

**Teacher**
1. Class & unit setup — create class, pick textbook unit, show join code
2. Live session — mic status, lesson-state cards, "preparando actividades por nivel…" indicator
3. Band review & approve — support/core/challenge artifacts with evidence; edit; approve per band (the wow moment)
4. Live monitor — per-student progress, stuck flags
5. Session report — completion, correctness, what to review tomorrow

**Student**
6. Join — code entry, display name
7. Waiting room — idle state until activity drops
8. Activity player — sandboxed artifact iframe + hints/results
9. Results — score + light celebration

## Contracts consumed

- `lesson_state` (from `packages/ai-core` via worker, delivered through Supabase Realtime)
- `ActivityArtifact` manifest + authorized `bundle_ref` (from `packages/activities`, verified before display and rendered in a sandboxed iframe)
- telemetry events (written to `events` table, read back for live monitor / session report)

Status: scaffolded with Vite, React, TypeScript, Tailwind CSS, shadcn-compatible UI utilities, React Router, TanStack Query, Zustand, React Hook Form, Zod, Supabase JS, Vitest, and Playwright.
