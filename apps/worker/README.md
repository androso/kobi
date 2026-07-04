# apps/worker

Node/TS background worker (Railway/Fly). Queue: pg-boss on Postgres — no extra infra.

## Stages

1. **Transcription** — audio chunks (45-60s) → text (Gemini Flash, rolling async)
2. **Lesson-state builder** — transcript → `lesson_state` JSON (topic, objective, confidence), every ~2 min
3. **Pre-generation** — curriculum chunks + activity repository → candidate activities
4. **Verifier** — rubric checks (alignment, age-fit, duration, answer-key correctness, duplicates) → auto-reject below threshold
5. **Variant maker** — on teacher approval, produces support/core/challenge variants

## Contracts

- Reads: `curriculum_chunks`, `activities` (repository) from `packages/db`
- Writes: `segments.lesson_state`, candidate `activities`, `assignments` variants
- Uses: `packages/ai-core` for model routing, `packages/curriculum` for retrieval, `packages/activities` for schema/validation

Status: placeholder only — no tooling installed yet.
