# packages/db

Supabase schema/migrations + shared TS types. One datastore (Postgres + pgvector + Realtime + Auth) for all state, including embeddings.

## Tables

| Table | Purpose | Key fields |
|---|---|---|
| `users` / `classes` / `enrollments` | Auth-lite: teachers via magic link; students via join code + display name | role, class_code |
| `sessions` | One class period | class_id, status, started_at |
| `segments` | Rolling lesson state | session_id, lesson_state (jsonb), confidence, transcript_summary |
| `curriculum_chunks` | Ingested textbook unit, objective-level | unit, objective_code, text, embedding |
| `activity_bundles` | Self-contained runnable HTML bundles | ref, index_html, checksum |
| `activities` | The repository: verified activity artifacts | contract_version, manifest (jsonb), bundle_ref, evidence (jsonb), parent_id, status, embedding, curriculum_tags, source, verifier_scores, times_used, avg_score |
| `session_activity_candidates` | Latest warm support/core/challenge candidates for teacher approval | session_id, activity_id, difficulty_band, status, evidence, verifier_scores |
| `assignments` | activity × student × variant | student_id, variant, status, score |
| `events` | Telemetry | type (attempt/hint/complete), payload, ts |
| `student_profiles` | Pedagogical band, teacher-editable | band (support/core/challenge), modality_pref, notes |

Maps to the four memory tiers: active lesson → `segments`; teacher/class → `classes` + approval history; student pedagogical → `student_profiles`; repository → `activities`.

Status: Area A/B tables live in `0001_init.sql`; Area C/E/F artifact, candidate, assignment, telemetry, and student-band tables live in `0002_area_c_activity_artifacts.sql`.
