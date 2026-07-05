# apps/worker

Node/TS background worker (Railway/Fly). Queue: pg-boss on Postgres — no extra infra.

## Stages

1. **Transcription** — audio chunks (45-60s) → text (Gemini Flash, rolling async)
2. **Lesson-state builder** — transcript → `lesson_state` JSON (topic, objective, confidence), every ~2 min
3. **Pre-generation** — curriculum chunks + activity repository → candidate `ActivityArtifact`s
4. **Verifier** — manifest/schema checks, sandbox boot, SDK telemetry assertions, and rubric checks → auto-reject below threshold
5. **Variant maker** — on teacher approval, produces support/core/challenge variants

## Contracts

- Reads: `curriculum_chunks`, `activities` (repository) from `packages/db`
- Writes: `segments.lesson_state`, verified `activities`, `session_activity_candidates`, and later `assignments` variants after teacher approval
- Uses: `packages/ai-core` for model routing, `packages/curriculum` for retrieval, `packages/activities` for manifest schema, verifier, and SDK contracts

Status: transcription, lesson-state building, and curriculum retrieval jobs are wired.
Pre-generation, verification, and variant making still need Area C/E implementation.
