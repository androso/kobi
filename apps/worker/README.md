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
4. **Verifier** — manifest/schema checks, sandbox boot, SDK telemetry assertions, and rubric checks → auto-reject below threshold

## Contracts

- Reads: `curriculum_chunks`, `activities` (repository) from `packages/db`
- Writes: `segments.lesson_state`, verified `activities`, `session_activity_candidates`, and later `assignments` variants after teacher approval
- Uses: `packages/ai-core` for model routing, `packages/curriculum` for retrieval, `packages/activities` for manifest schema, verifier, and SDK contracts

Status: **partial/environment-dependent**. Transcription, lesson-state building, checkpoint evaluation, curriculum retrieval, and activity generation (repository reuse + static fallback + OpenAI generation with verifier) are wired. End-to-end operation requires a running Supabase DB (`DATABASE_URL`) and model credentials (`OPENAI_API_KEY`, `GEMINI_API_KEY`). Assignment delivery to students after teacher approval is implemented in `apps/web` via Supabase Realtime; the worker enqueues generated candidates for that flow.
