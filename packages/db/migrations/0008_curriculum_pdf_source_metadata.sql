alter table curriculum_chunks
  add column if not exists source_document text,
  add column if not exists source_page_start integer,
  add column if not exists source_page_end integer,
  add column if not exists section_title text,
  add column if not exists chunk_index integer,
  add column if not exists content_hash text;

create index if not exists curriculum_chunks_source_idx
  on curriculum_chunks (source_document, source_page_start);

create unique index if not exists curriculum_chunks_content_hash_idx
  on curriculum_chunks (content_hash);

-- Postgres forbids changing the return type via CREATE OR REPLACE.
-- Wrapped in a transaction so the drop + recreate is atomic.
begin;
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
  source_document text,
  source_page_start integer,
  source_page_end integer,
  section_title text,
  chunk_index integer,
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
    c.source_document,
    c.source_page_start,
    c.source_page_end,
    c.section_title,
    c.chunk_index,
    1 - (c.embedding <=> query_embedding) as similarity
  from curriculum_chunks c
  where c.grade = match_grade
    and c.subject = match_subject
    and (match_unit is null or c.unit = match_unit)
  order by c.embedding <=> query_embedding
  limit match_count;
$$;
commit;
