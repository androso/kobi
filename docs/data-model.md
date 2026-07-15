# Data Model

Source of truth: Notion "Kobi MVP v0 — Standalone Product Spec" §7, cross-checked against `docs/area-bc-contract.md`. Schema-as-code lives in `packages/db/src/schema` (Drizzle ORM); this doc is the one-page reference so Areas C/D/E/F don't have to re-derive it from the TS files.

## ER diagram

```
teacher_profiles (1:1 with Supabase auth.users, not FK-enforced across schemas)
  id (uuid, PK, = auth.users.id)
  display_name
  created_at
      │
      │ 1—N
      ▼
classes
  id (uuid, PK)
  teacher_id (FK -> teacher_profiles.id)
  name
  join_code (unique)
  grade, subject, unit         -- v0: one class = one grade/subject/unit
  created_at
      │                              │
      │ 1—N                          │ 1—N
      ▼                              ▼
students                        sessions
  id (uuid, PK)                   id (uuid, PK)
  class_id (FK -> classes.id)     class_id (FK -> classes.id)
  display_name                    status (active|ended)
  joined_at                       started_at, ended_at
      │                              │              │           │
      │ 1—1                          │ 1—N           │ 1—N       │ 1—N
      ▼                              ▼               ▼           ▼
student_profiles                audio_chunks     segments    checkpoints
  student_id (PK, FK)             id (PK)          id (PK)      id (PK)
  modality_pref, notes            session_id (FK)  session_id (FK) session_id (FK)
  updated_at                      chunk_index      lesson_state (jsonb) ready (bool)
                                   storage_path     confidence   reason, summary
                                   start_ms/end_ms  transcript_summary  session_context (jsonb)
                                   status           created_at   created_at
                                   transcript_text
                                   unique(session_id, chunk_index)

curriculum_sources (Area B teacher-fed material)
  id, class_id (FK -> classes.id), source_document, original_filename, content_type,
  size_bytes, storage_path, status (pending_upload|uploaded|processing|ready|failed|superseded),
  error_message, page_count, chunks_built, created_at, updated_at

curriculum_chunks (standalone / class-scoped, Area B)
  id, class_id (nullable FK -> classes.id), grade, subject, unit, objective_code, text,
  embedding vector(768), source_document, source_page_start, source_page_end,
  section_title, chunk_index, content_hash, created_at
  + ivfflat index, service-role match_curriculum_chunks() RPC (class rows or global rows only), replace_curriculum_source() RPC

activity_bundles
  ref (text, PK)
  index_html, checksum, created_at

activities (the repository — Area C, revised per D2)
  id (uuid, PK)
  contract_version (text, default activity-artifact/v1)
  bundle_ref (FK -> activity_bundles.ref, unique)
  manifest (jsonb)                -- curriculum tags, answer key, hints, est_minutes, variants
  evidence (jsonb)                -- generation-time visible curriculum evidence
  status (candidate|verified|rejected|superseded)
  embedding (vector(768), nullable) -- for repository semantic reuse search
  curriculum_tags (text[])
  source (seeded|reused|new)
  verifier_scores (jsonb)
  times_used (int, default 0)
  avg_score (real, nullable)
  parent_id (FK -> activities.id, nullable)
  created_at, updated_at
      │
      │ 1—N
      ▼
session_activity_candidates
  id (uuid, PK)
  session_id (FK -> sessions.id)
  activity_id (FK -> activities.id)
  difficulty_band (support|core|challenge)
  status (ready|approved|rejected|superseded)
  source (seeded|reused|new)
  context_snapshot, evidence, verifier_scores (jsonb)
  created_at, approved_at
      │
      │ 1—N
      ▼
assignments
  id (uuid, PK)
  session_id (FK -> sessions.id)
  candidate_id (FK -> session_activity_candidates.id)
  activity_id (FK -> activities.id)
  student_id (FK -> students.id)
  variant (support|core|challenge, default core)
  status (assigned|in_progress|completed)
  score (real, nullable)
  created_at, completed_at (nullable)
  unique(session_id, student_id)
  + DB trigger: candidate must be approved and match session_id/activity_id/variant;
    student must belong to the session class
      │
      │ 1—N
      ▼
events
  id (uuid, PK)
  assignment_id (FK -> assignments.id)
  type (attempt|hint|complete)
  payload (jsonb)
  ts (timestamptz, default now())
```

## Table ownership

| Table | Owning area | Notes |
|---|---|---|
| `teacher_profiles` | F (Platform) | Mirrors `auth.users.id` (Supabase Auth magic link); no cross-schema FK, just a matching UUID convention. |
| `classes` | F (Platform) / D (Teacher) | v0: one class = one grade/subject/unit. `join_code` is what students use to enter. |
| `students` | F (Platform) | Active rows map unique `username` and `auth_user_id` to a teacher-managed Supabase Auth account, with `is_active` and `activated_at`. Rows without `auth_user_id` are preserved historical auth-lite records and are excluded from the active roster. |
| `student_profiles` | D (Teacher) / E (Student) | Teacher-editable notes/preferences only. Difficulty is assigned per session, not stored as a lasting student label. |
| `sessions` | A (Listening) | One row per class period; drives `audio_chunks`/`segments`. |
| `audio_chunks` | A (Listening) | Implemented — see `packages/ai-core`, `apps/worker`. |
| `segments` | A (Listening) | Implemented — rolling `lesson_state` snapshots (see `docs/contracts.md`). |
| `checkpoints` | A/B boundary (Understand -> Propose gate) | Implemented — one row per checkpoint evaluation (`ready`, `reason`, `summary`, `session_context` snapshot). Runs on its own timer, decoupled from `segments`' per-chunk cadence; see `docs/contracts.md` §2 and `docs/area-bc-contract.md`. |
| `curriculum_chunks` | B (Curriculum) | Implemented — see `packages/curriculum`, `docs/area-bc-contract.md`. |
| `activity_bundles` | C (Activity Generation) | Stores verified self-contained `index.html` bundles by `bundle_ref`. |
| `activities` | C (Activity Generation) | Verified artifact repository. `manifest` internals are owned by `packages/activities`; evidence/status/source are queryable for shortlist and reuse. |
| `session_activity_candidates` | C/D (Generation + Teacher) | The durable shortlist/approval record for support, core, and challenge candidates in one session. |
| `assignments` | E (Student Experience) | One delivered activity per student per session. Teacher-selected support/challenge overrides are recorded here; unselected students default to core. |
| `events` | E (Student Experience) | Telemetry — see `docs/contracts.md` §3. |

## Relation to the four memory tiers (product spec §21)

- Active lesson → `segments` + `checkpoints`
- Teacher/class → `classes` + `session_activity_candidates` approval history
- Student pedagogical → `assignments.variant` per session + `student_profiles` notes/preferences
- Repository → `activities`

## Why `curriculum_chunks` has no FK to `activities`

An activity's curriculum grounding is a **snapshot at generation time** (the `CurriculumMatch[]` evidence used when it was authored), stored inside `manifest.curriculum` — not a live join. `curriculum_chunks` rows can be re-ingested or re-embedded without needing to touch every activity that was ever grounded in them.

## Implementation status

Schema-as-code + migrations: **shipped** in `packages/db/src/schema` (Drizzle ORM, postgres.js driver). `pnpm --filter @kobi/db run db:generate` regenerates SQL from the schema into `packages/db/drizzle/`; `pnpm --filter @kobi/db run db:migrate` applies those plus `packages/db/migrations/0002_vector_extras.sql` (the `vector` extension, the ivfflat index, and `match_curriculum_chunks()` — not expressible as Drizzle schema). Applying migrations requires a live Supabase or Postgres instance.
