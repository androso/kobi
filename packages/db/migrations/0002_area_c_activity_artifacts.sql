-- Area C/D/E/F schema slice for verified HTML activity artifacts, teacher
-- approval candidates, assignment delivery, student bands, and telemetry.

create table if not exists activity_bundles (
  ref text primary key,
  index_html text not null,
  checksum text not null,
  created_at timestamptz not null default now()
);

create table if not exists activities (
  id uuid primary key default gen_random_uuid(),
  contract_version text not null default 'activity-artifact/v1',
  manifest jsonb not null,
  bundle_ref text not null unique references activity_bundles(ref),
  evidence jsonb not null default '[]'::jsonb,
  parent_id uuid references activities(id),
  status text not null default 'verified' check (status in ('candidate', 'verified', 'rejected', 'superseded')),
  embedding vector(768),
  curriculum_tags text[] not null default '{}',
  source text not null default 'generated' check (source in ('seeded', 'reused', 'forked', 'generated')),
  verifier_scores jsonb not null,
  times_used integer not null default 0,
  avg_score real,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists activities_embedding_idx
  on activities using ivfflat (embedding vector_cosine_ops)
  with (lists = 100);

create index if not exists activities_curriculum_tags_idx
  on activities using gin (curriculum_tags);

create index if not exists activities_status_idx
  on activities (status);

create table if not exists session_activity_candidates (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references sessions(id) on delete cascade,
  activity_id uuid not null references activities(id) on delete cascade,
  difficulty_band text not null check (difficulty_band in ('support', 'core', 'challenge')),
  status text not null default 'ready' check (status in ('ready', 'approved', 'rejected', 'superseded')),
  source text not null check (source in ('reused', 'forked', 'generated')),
  context_snapshot jsonb not null,
  evidence jsonb not null default '[]'::jsonb,
  verifier_scores jsonb not null,
  created_at timestamptz not null default now(),
  approved_at timestamptz
);

create index if not exists session_activity_candidates_latest_idx
  on session_activity_candidates (session_id, difficulty_band, status, created_at desc);

create table if not exists student_profiles (
  id uuid primary key default gen_random_uuid(),
  class_id uuid not null,
  display_name text not null,
  band text not null default 'core' check (band in ('support', 'core', 'challenge')),
  modality_pref text,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists assignments (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references sessions(id) on delete cascade,
  student_id uuid not null references student_profiles(id) on delete cascade,
  activity_id uuid not null references activities(id),
  variant text not null check (variant in ('support', 'core', 'challenge')),
  status text not null default 'assigned' check (status in ('assigned', 'in_progress', 'completed')),
  score real,
  created_at timestamptz not null default now(),
  completed_at timestamptz
);

create index if not exists assignments_session_student_idx
  on assignments (session_id, student_id);

create table if not exists events (
  id uuid primary key default gen_random_uuid(),
  assignment_id uuid references assignments(id) on delete cascade,
  student_id uuid references student_profiles(id) on delete set null,
  session_id uuid references sessions(id) on delete cascade,
  type text not null check (type in ('attempt', 'hint', 'complete')),
  payload jsonb not null,
  ts timestamptz not null default now()
);

create index if not exists events_assignment_ts_idx
  on events (assignment_id, ts desc);
