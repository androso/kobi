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

## Implementation status

- **Shipped in code:** teacher/student authentication, class creation and joining, live/manual lesson input, candidate review and approval, authorized sandboxed artifact delivery, assignment progress/completion telemetry, and session history UI.
- **Partial:** the live monitor and report expose the current v0 completion/correctness data, but longitudinal analytics and richer stuck-state analysis remain outside the MVP.
- **Demo-only:** the explicit demo-project path uses invented classes/transcripts for local walkthroughs; it is isolated behind demo configuration and is not a production data fallback.
- **Production-dependent:** real use requires the worker API plus a migrated Supabase project with Realtime, RLS/RPC policies, and the activity/audio storage buckets configured.
