# packages/db

Supabase schema/migrations + shared TS types. One datastore (Postgres + pgvector + Realtime + Auth) for all state, including embeddings.

## Tables

| Table | Purpose | Key fields |
|---|---|---|
| `teacher_profiles` / `classes` / `students` | Teachers use Supabase Auth; teachers provision durable student Auth accounts | teacher_id, username, auth_user_id, is_active |
| `sessions` | One class period | class_id, status, started_at |
| `segments` | Rolling lesson state | session_id, lesson_state (jsonb), confidence, transcript_summary, source_through_chunk_index |
| `curriculum_chunks` | Ingested textbook unit, objective-level | unit, objective_code, text, embedding |
| `curriculum_sources` / `curriculum_source_selections` | Shared PDF sources and each class's active RAG corpus | uploader, grade, subject, status, source_id |
| `activity_bundles` | Self-contained runnable HTML bundles | ref, index_html, checksum |
| `activities` | The repository: verified activity artifacts | contract_version, manifest (jsonb), bundle_ref, evidence (jsonb), parent_id, status, embedding, curriculum_tags, source, verifier_scores, times_used, avg_score |
| `session_activity_candidates` | Teacher-visible support/core/challenge shortlist | session_id, activity_id, difficulty_band, status, evidence |
| `assignments` | delivered activity × student × session | session_id, candidate_id, student_id, variant, status, score |
| `events` | Telemetry | type (attempt/hint/complete), payload, ts |
| `student_profiles` | Teacher-editable student notes/preferences | modality_pref, notes |

Maps to the four memory tiers: active lesson → `segments`; teacher/class → `classes` + `session_activity_candidates`; student pedagogical → per-session `assignments.variant` plus `student_profiles` notes; repository → `activities`.

Status: **shipped**. Drizzle schema and migrations cover all v0 tables, triggers, and the `match_curriculum_chunks()` RPC. Run `pnpm --filter @kobi/db db:generate` to regenerate migration output and `pnpm --filter @kobi/db db:migrate` to apply against a Supabase/Postgres instance.
