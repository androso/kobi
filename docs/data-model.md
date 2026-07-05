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
      │                              │              │
      │ 1—1                          │ 1—N           │ 1—N
      ▼                              ▼               ▼
student_profiles                audio_chunks     segments
  student_id (PK, FK)             id (PK)          id (PK)
  band (support|core|challenge)   session_id (FK)  session_id (FK)
  modality_pref, notes            chunk_index      lesson_state (jsonb)
                                   storage_path     confidence
                                   start_ms/end_ms  transcript_summary
                                   status           created_at
                                   transcript_text
                                   unique(session_id, chunk_index)

curriculum_chunks (standalone, Area B)
  id, grade, subject, unit, objective_code, text, embedding vector(768), created_at
  + ivfflat index, match_curriculum_chunks() RPC

activities (the repository — Area C, revised per D2)
  id (uuid, PK)
  bundle_ref (text)              -- pointer to the code artifact (storage path/URL)
  manifest (jsonb)                -- curriculum tags, answer key, hints, est_minutes, variants
  embedding (vector(768), nullable) -- for repository semantic reuse search
  source (reused|new)
  verifier_scores (jsonb)
  times_used (int, default 0)
  avg_score (real, nullable)
  parent_id (FK -> activities.id, nullable) -- fork lineage
  created_at
      │
      │ 1—N
      ▼
assignments
  id (uuid, PK)
  activity_id (FK -> activities.id)
  student_id (FK -> students.id)
  variant (support|core|challenge)
  status (assigned|in_progress|completed)
  score (real, nullable)
  created_at, completed_at (nullable)
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
| `students` | F (Platform) | No Supabase Auth row at all — join code + display name only (auth-lite: no student accounts). |
| `student_profiles` | D (Teacher) / E (Student) | Teacher-editable band (D4: banding, not deep learner modeling). |
| `sessions` | A (Listening) | One row per class period; drives `audio_chunks`/`segments`. |
| `audio_chunks` | A (Listening) | Implemented — see `packages/ai-core`, `apps/worker`. |
| `segments` | A (Listening) | Implemented — rolling `lesson_state` snapshots (see `docs/contracts.md`). |
| `curriculum_chunks` | B (Curriculum) | Implemented — see `packages/curriculum`, `docs/area-bc-contract.md`. |
| `activities` | C (Activity Generation) | Not yet implemented. `manifest`'s internal shape is Androso's call, not prescribed here (see `packages/activities/README.md`). |
| `assignments` | E (Student Experience) | activity x student x variant. |
| `events` | E (Student Experience) | Telemetry — see `docs/contracts.md` §3. |

## Relation to the four memory tiers (product spec §21)

- Active lesson → `segments`
- Teacher/class → `classes` + approval history (future `activities`/`assignments` rows)
- Student pedagogical → `student_profiles`
- Repository → `activities`

## Why `curriculum_chunks` has no FK to `activities`

An activity's curriculum grounding is a **snapshot at generation time** (the `CurriculumMatch[]` evidence used when it was authored), stored inside `manifest.curriculum` — not a live join. `curriculum_chunks` rows can be re-ingested or re-embedded without needing to touch every activity that was ever grounded in them.

## Implementation status

Schema-as-code + migrations: `packages/db/src/schema` (Drizzle ORM, postgres.js driver). `pnpm --filter @kobi/db run db:generate` regenerates SQL from the schema into `packages/db/drizzle/`; `pnpm --filter @kobi/db run db:migrate` applies those plus `packages/db/migrations/0002_vector_extras.sql` (the `vector` extension, the ivfflat index, and `match_curriculum_chunks()` — not expressible as Drizzle schema). No live Supabase project has been migrated against yet.
