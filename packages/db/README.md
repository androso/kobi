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

Status: the Drizzle schema and Supabase-specific migrations implement the v0 tables, candidate/assignment integrity checks, authorized student delivery RPCs, and session rejoin token rotation. The worker writes candidates to `session_activity_candidates`, and the web approval path creates per-student `assignments` with core as the default band. Runtime behavior remains production-dependent on applying every migration to the target Supabase project.
