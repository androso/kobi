-- Applied by src/migrate.ts after drizzle-kit's generated migrations run.
-- Not expressible as drizzle-kit schema: a custom (ivfflat) index access
-- method and a plain SQL function. Both idempotent.

create index if not exists curriculum_chunks_embedding_idx
  on curriculum_chunks using ivfflat (embedding vector_cosine_ops)
  with (lists = 100);

create index if not exists activities_embedding_idx
  on activities using ivfflat (embedding vector_cosine_ops)
  with (lists = 100);

create index if not exists activities_curriculum_tags_idx
  on activities using gin (curriculum_tags);

-- RPC used by packages/curriculum's retrieveCurriculumMatches(): top-k by cosine
-- similarity, scoped to grade/subject/unit. Called via supabase.rpc(...).
-- Later migrations extend this RPC's result columns. Raw migrations are replayed,
-- so recreate this historical version instead of replacing an incompatible row type.
drop function if exists match_curriculum_chunks(vector, integer, text, text, integer);

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
