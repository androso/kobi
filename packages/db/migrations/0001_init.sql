-- Kobi v0 — initial schema slice for Area A (Listening & Understanding)
-- and Area B (Curriculum & Retrieval). Other tables (classes, activities,
-- assignments, events, student_profiles) land in a later migration once
-- Areas C/D/E start building against them.

create extension if not exists vector;

create table if not exists sessions (
  id uuid primary key default gen_random_uuid(),
  class_id uuid not null,
  status text not null default 'active' check (status in ('active', 'ended')),
  started_at timestamptz not null default now()
);

-- One row per ~45-60s audio chunk uploaded from the teacher's mic.
create table if not exists audio_chunks (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references sessions(id) on delete cascade,
  chunk_index integer not null,
  storage_path text not null,
  start_ms integer not null,
  end_ms integer not null,
  status text not null default 'pending' check (status in ('pending', 'transcribing', 'transcribed', 'failed')),
  transcript_text text,
  created_at timestamptz not null default now(),
  unique (session_id, chunk_index)
);

-- Rolling lesson_state snapshots, built from 1-2 chunks of transcript at a time.
create table if not exists segments (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references sessions(id) on delete cascade,
  lesson_state jsonb not null,
  confidence real not null,
  transcript_summary text not null,
  created_at timestamptz not null default now()
);

-- Objective-level textbook chunks (D1: 7th-grade Lenguaje unit), embedded for retrieval.
create table if not exists curriculum_chunks (
  id uuid primary key default gen_random_uuid(),
  grade integer not null,
  subject text not null,
  unit text not null,
  objective_code text not null,
  text text not null,
  embedding vector(768),
  created_at timestamptz not null default now()
);

create index if not exists curriculum_chunks_embedding_idx
  on curriculum_chunks using ivfflat (embedding vector_cosine_ops)
  with (lists = 100);

create index if not exists curriculum_chunks_filters_idx
  on curriculum_chunks (grade, subject, unit);

-- RPC used by packages/curriculum's retrieveCurriculumMatches(): top-k by cosine
-- similarity, scoped to grade/subject/unit. Called via supabase.rpc(...).
create or replace function match_curriculum_chunks(
  query_embedding vector(768),
  match_grade integer,
  match_subject text,
  match_unit text default null,
  match_count integer default 3
)
returns table (
  id uuid,
  objective_code text,
  unit text,
  grade integer,
  subject text,
  text text,
  similarity real
)
language sql stable
as $$
  select
    c.id,
    c.objective_code,
    c.unit,
    c.grade,
    c.subject,
    c.text,
    1 - (c.embedding <=> query_embedding) as similarity
  from curriculum_chunks c
  where c.grade = match_grade
    and c.subject = match_subject
    and (match_unit is null or c.unit = match_unit)
  order by c.embedding <=> query_embedding
  limit match_count;
$$;
