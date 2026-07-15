-- Teacher-fed curriculum sources + class-scoped chunk metadata for RAG ingest.

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('curriculum-sources', 'curriculum-sources', false, 26214400, array['application/pdf'])
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

do $$ begin
  create type curriculum_source_status as enum (
    'pending_upload',
    'uploaded',
    'processing',
    'ready',
    'failed'
  );
exception
  when duplicate_object then null;
end $$;

create table if not exists curriculum_sources (
  id uuid primary key default gen_random_uuid() not null,
  class_id uuid not null references classes(id) on delete cascade,
  source_document text not null,
  original_filename text not null,
  content_type text not null,
  size_bytes integer not null,
  storage_path text not null,
  status curriculum_source_status not null default 'pending_upload',
  error_message text,
  page_count integer,
  chunks_built integer,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists curriculum_sources_class_idx
  on curriculum_sources (class_id, created_at desc);

create unique index if not exists curriculum_sources_storage_path_idx
  on curriculum_sources (storage_path);

alter table curriculum_sources enable row level security;
revoke all on table curriculum_sources from anon, authenticated;
grant all on table curriculum_sources to service_role;

alter table curriculum_chunks
  add column if not exists class_id uuid references classes(id) on delete cascade,
  add column if not exists source_document text,
  add column if not exists source_page_start integer,
  add column if not exists source_page_end integer,
  add column if not exists section_title text,
  add column if not exists chunk_index integer,
  add column if not exists content_hash text;

create index if not exists curriculum_chunks_class_idx
  on curriculum_chunks (class_id);

create index if not exists curriculum_chunks_source_idx
  on curriculum_chunks (source_document, source_page_start);

drop index if exists curriculum_chunks_content_hash_idx;
create index if not exists curriculum_chunks_content_hash_idx
  on curriculum_chunks (content_hash);

alter table curriculum_chunks enable row level security;
revoke all on table curriculum_chunks from anon, authenticated;
grant all on table curriculum_chunks to service_role;

-- Postgres forbids changing the return type via CREATE OR REPLACE.
begin;
drop function if exists match_curriculum_chunks(vector, integer, text, text, integer);
drop function if exists match_curriculum_chunks(vector, integer, text, text, integer, uuid);

create or replace function match_curriculum_chunks(
  query_embedding vector(768),
  match_grade integer,
  match_subject text,
  match_unit text default null,
  match_count integer default 3,
  match_class_id uuid default null
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
    and (
      (match_class_id is null and c.class_id is null)
      or c.class_id = match_class_id
    )
  order by
    c.embedding <=> query_embedding,
    c.objective_code asc,
    c.source_page_start asc nulls last,
    c.chunk_index asc nulls last,
    c.id asc
  limit match_count;
$$;

create or replace function replace_curriculum_source(
  p_class_id uuid,
  p_source_document text,
  p_rows jsonb
)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  inserted_count integer;
begin
  if p_source_document is null or btrim(p_source_document) = '' then
    raise exception 'replace_curriculum_source: source document is required';
  end if;

  if p_rows is null or jsonb_typeof(p_rows) <> 'array' then
    raise exception 'replace_curriculum_source: rows must be an array';
  end if;

  if jsonb_array_length(p_rows) = 0 then
    raise exception 'replace_curriculum_source: rows must not be empty';
  end if;

  if jsonb_array_length(p_rows) > 1000 then
    raise exception 'replace_curriculum_source: at most 1000 rows allowed';
  end if;

  if exists (
    select 1
    from jsonb_array_elements(p_rows) as item(row_data)
    where jsonb_typeof(row_data->'embedding') <> 'array'
      or jsonb_array_length(row_data->'embedding') <> 768
      or coalesce(row_data->>'content_hash', '') = ''
      or coalesce(row_data->>'grade', '') !~ '^\d+$'
      or coalesce(row_data->>'subject', '') = ''
      or coalesce(row_data->>'unit', '') = ''
      or coalesce(row_data->>'objective_code', '') = ''
      or coalesce(row_data->>'text', '') = ''
  ) then
    raise exception 'replace_curriculum_source: invalid row payload';
  end if;

  if exists (
    select 1
    from jsonb_array_elements(p_rows) as item(row_data)
    group by row_data->>'content_hash'
    having count(*) > 1
  ) then
    raise exception 'replace_curriculum_source: duplicate content_hash values in batch';
  end if;

  if p_class_id is null then
    delete from curriculum_chunks
    where class_id is null
      and source_document = p_source_document;
  else
    delete from curriculum_chunks
    where class_id = p_class_id;
  end if;

  insert into curriculum_chunks (
    class_id,
    grade,
    subject,
    unit,
    objective_code,
    text,
    embedding,
    source_document,
    source_page_start,
    source_page_end,
    section_title,
    chunk_index,
    content_hash
  )
  select
    p_class_id,
    (row_data->>'grade')::integer,
    row_data->>'subject',
    row_data->>'unit',
    row_data->>'objective_code',
    row_data->>'text',
    (
      '[' || (
        select string_agg(value::text, ',' order by ordinality)
        from jsonb_array_elements(row_data->'embedding') with ordinality as embedding_value(value, ordinality)
      ) || ']'
    )::vector(768),
    p_source_document,
    nullif(row_data->>'source_page_start', '')::integer,
    nullif(row_data->>'source_page_end', '')::integer,
    nullif(row_data->>'section_title', ''),
    nullif(row_data->>'chunk_index', '')::integer,
    row_data->>'content_hash'
  from jsonb_array_elements(p_rows) as item(row_data);

  get diagnostics inserted_count = row_count;
  return inserted_count;
end;
$$;

revoke all on function match_curriculum_chunks(vector, integer, text, text, integer, uuid) from public, anon, authenticated;
grant execute on function match_curriculum_chunks(vector, integer, text, text, integer, uuid) to service_role;
revoke all on function replace_curriculum_source(uuid, text, jsonb) from public, anon, authenticated;
grant execute on function replace_curriculum_source(uuid, text, jsonb) to service_role;
commit;
