# packages/db

Supabase schema/migrations + shared TS types. One datastore (Postgres + pgvector + Realtime + Auth) for all state, including embeddings.

## Tables

| Table | Purpose | Key fields |
|---|---|---|
| `users` / `classes` / `enrollments` | Auth-lite: teachers via magic link; students via join code + display name | role, class_code |
| `sessions` | One class period | class_id, status, started_at |
| `segments` | Rolling lesson state | session_id, lesson_state (jsonb), confidence, transcript_summary |
| `curriculum_chunks` | Ingested textbook unit, objective-level | unit, objective_code, text, embedding |
| `activities` | The repository: JSON artifacts | payload (jsonb), answer_key, embedding, curriculum_tags, source, verifier_scores, times_used, avg_score |
| `assignments` | activity × student × variant | student_id, variant, status, score |
| `events` | Telemetry | type (attempt/hint/complete), payload, ts |
| `student_profiles` | Pedagogical band, teacher-editable | band (support/core/challenge), modality_pref, notes |

Maps to the four memory tiers: active lesson → `segments`; teacher/class → `classes` + approval history; student pedagogical → `student_profiles`; repository → `activities`.

Status: placeholder — schema/migrations not yet written.
