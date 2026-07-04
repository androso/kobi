# apps/web

Next.js app: teacher portal + student portal + API routes — **one deploy** (Vercel).

## Screens

**Teacher**
1. Class & unit setup — create class, pick textbook unit, show join code
2. Live session — mic status, lesson-state cards, "preparando 3 actividades…" indicator
3. Shortlist & approve — 3 candidates with evidence; edit; approve (the wow moment)
4. Live monitor — per-student progress, stuck flags
5. Session report — completion, correctness, what to review tomorrow

**Student**
6. Join — code entry, display name
7. Waiting room — idle state until activity drops
8. Activity player — generic renderer + hints
9. Results — score + light celebration

## Contracts consumed

- `lesson_state` (from `packages/ai-core` via worker, delivered through Supabase Realtime)
- activity JSON (from `packages/activities`, validated + rendered by the generic player)
- telemetry events (written to `events` table, read back for live monitor / session report)

Status: placeholder only — not yet scaffolded with `create-next-app`.
