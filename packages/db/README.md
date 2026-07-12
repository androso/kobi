# packages/db

Supabase schema/migrations + shared TS types. One datastore (Postgres + pgvector + Realtime + Auth) for all state, including embeddings.

## Tables

| Table | Purpose | Key fields |
|---|---|---|
| `teacher_profiles` / `classes` / `students` | Auth-lite: teachers via magic link; students via join code + display name | teacher_id, join_code, display_name |
| `sessions` | One class period | class_id, status, started_at |
| `segments` | Rolling lesson state | session_id, lesson_state (jsonb), confidence, transcript_summary |
| `curriculum_chunks` | Ingested textbook unit, objective-level | unit, objective_code, text, embedding |
| `activity_bundles` | Self-contained runnable HTML bundles | ref, index_html, checksum |
| `activities` | The repository: verified activity artifacts | contract_version, manifest (jsonb), bundle_ref, evidence (jsonb), parent_id, status, embedding, curriculum_tags, source, verifier_scores, times_used, avg_score |
| `session_activity_candidates` | Teacher-visible support/core/challenge shortlist | session_id, activity_id, difficulty_band, status, evidence |
| `assignments` | delivered activity × student × session | session_id, candidate_id, student_id, variant, status, score |
| `events` | Telemetry | type (attempt/hint/complete), payload, ts |
| `student_profiles` | Teacher-editable student notes/preferences | modality_pref, notes |

Maps to the four memory tiers: active lesson → `segments`; teacher/class → `classes` + `session_activity_candidates`; student pedagogical → per-session `assignments.variant` plus `student_profiles` notes; repository → `activities`.

Status: Drizzle schema/migration scaffolding exists. Area C should write candidates to `session_activity_candidates`; Area E should create one `assignments` row per student, defaulting unselected students to the core variant.

## Migrations

Run all database changes from the repository root with:

```bash
KOBI_RELEASE_ID="$(git rev-parse HEAD)" pnpm --filter @kobi/db db:migrate
```

The runner holds a PostgreSQL advisory lock across the complete Drizzle and raw-SQL sequence, so concurrent deploys wait instead of changing the schema in parallel. Raw migrations are stored in filename order under `migrations/`; each file runs once in its own transaction and is recorded in `public.kobi_raw_migrations` with its SHA-256 checksum, application time, duration, and release identifier.

Committed migration files are immutable. If an applied file's checksum changes, the runner stops before applying any pending raw migration; restore the original file and put the correction in a new, higher-numbered migration. A migration that cannot run in a transaction, such as `create index concurrently`, must be delivered as a separately reviewed operational change and documented with its retry and recovery procedure rather than added to this directory.

See [`docs/database-deployments.md`](../../docs/database-deployments.md) for deployment ordering, compatibility windows, backup/recovery, and validation procedures.
