# apps/worker

Node/TS background worker (Railway/Fly). Queue: pg-boss on Postgres — no extra infra.

The worker also owns the small HTTP API used by the Vite web app for live audio:

- `GET /health`
- `POST /api/sessions` with `{ "classId": "<classes.id uuid>" }`
- `POST /api/sessions/:id/audio-chunks` as `multipart/form-data` with `audio`, `chunk_index`, `start_ms`, `end_ms`
- `POST /api/sessions/:id/manual-lesson-state` with `{ "topic": "...", "objective": "..." }`

Required API env: `PORT`, `DATABASE_URL`, `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `AUDIO_BUCKET`, plus `KOBI_API_CORS_ORIGIN` when web runs on a different origin.

## Stages

1. **Transcription** — audio chunks (45-60s) → text (Gemini Flash, rolling async)
2. **Lesson-state builder** — transcript → `lesson_state` JSON (topic, objective, confidence), every ~2 min
3. **Pre-generation** — curriculum chunks + activity repository → support/core/challenge candidate `ActivityArtifact`s
4. **Verifier** — manifest/schema, static bundle, SDK hook, and manifest/code consistency checks plus local rubric scoring → reject invalid artifacts before persistence

## Contracts

- Reads: `curriculum_chunks`, `activities` (repository) from `packages/db`
- Writes: `segments.lesson_state`, verified `activities`, `session_activity_candidates`, and later `assignments` variants after teacher approval
- Uses: `packages/ai-core` for model routing, `packages/curriculum` for retrieval, `packages/activities` for manifest schema, verifier, and SDK contracts

## Implementation status

- **Shipped in code:** the HTTP API, pg-boss registration, transcription, lesson-state building, checkpoint scheduling/evaluation, curriculum retrieval, retrieval-first OpenAI/static activity generation, deterministic verification, bundle persistence, and support/core/challenge candidate persistence.
- **Demo-only:** `src/demoTranscript.ts` and `src/dev/` use invented lesson data for local pipeline exercises; OpenAI artifact output is written under `/tmp/kobi-artifacts`, not into production paths.
- **Production-dependent:** startup and end-to-end processing require a migrated Supabase project, storage buckets, provider credentials, and a separately deployed worker. This repository does not claim a production deployment.
