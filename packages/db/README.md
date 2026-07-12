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

## Access matrix

Migration `0011_complete_rls_baseline.sql` owns the complete public-schema RLS and grant baseline. A fresh deployment must not depend on policies or grants configured in the Supabase dashboard.

| Data | `anon` | Authenticated teacher | `service_role` |
|---|---|---|---|
| `teacher_profiles` | No table access | Create, read, and update own row | Full access |
| `classes` | No table access | Create, read, and update owned classes | Full access |
| `sessions` | No table access | Create, read, and update through owned classes | Full access |
| `students`, `student_profiles` | No table access | Read through owned classes; create/update profile notes | Full access |
| `segments` | No table access | Read through owned classes | Full access |
| `session_activity_candidates` | No table access | Read and approve/reject through owned classes | Full access |
| `activities`, `activity_bundles` | No table access | Read only when linked to a candidate in an owned class | Full access |
| `assignments` | No table access | Create, read, and update through owned classes | Full access |
| `events` | No table access | Read through assignments in owned classes | Full access |
| `audio_chunks`, `checkpoints`, `curriculum_chunks` | No table access | No table access | Full access |

Auth-lite students use only the token-checked `join_class_by_code`, assignment loading, dismissal, telemetry, and completion RPCs. Those security-definer functions are executable by `anon` and `authenticated`, while their underlying tables remain unavailable to `anon`; this preserves assignment/class-scoped delivery without broad table policies.

Worker and ingestion code must use the server-only `SUPABASE_SERVICE_ROLE_KEY`. The service role bypasses RLS in Supabase, so generation, audio processing, checkpoint evaluation, curriculum ingestion, and bundle writes do not require browser policies.
