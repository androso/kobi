-- Shared curriculum library, per-class source selections, and raw-file cleanup state.

alter type curriculum_source_status add value if not exists 'cleanup_pending';

do $$ begin
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'curriculum_sources' and column_name = 'class_id'
  ) and not exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'curriculum_sources' and column_name = 'origin_class_id'
  ) then
    alter table curriculum_sources rename column class_id to origin_class_id;
  end if;
end $$;

alter table curriculum_sources
  add column if not exists uploaded_by uuid references teacher_profiles(id) on delete set null,
  add column if not exists grade integer,
  add column if not exists subject text,
  add column if not exists unit text,
  add column if not exists storage_deleted_at timestamptz;

alter table curriculum_sources drop constraint if exists curriculum_sources_class_id_fkey;
alter table curriculum_sources drop constraint if exists curriculum_sources_origin_class_id_fkey;
alter table curriculum_sources
  add constraint curriculum_sources_origin_class_id_fkey
  foreign key (origin_class_id) references classes(id) on delete set null;

update curriculum_sources s
set uploaded_by = c.teacher_id,
    grade = c.grade,
    subject = c.subject,
    unit = c.unit
from classes c
where c.id = s.origin_class_id
  and (s.uploaded_by is null or s.grade is null or s.subject is null or s.unit is null);

alter table curriculum_sources
  alter column grade set not null,
  alter column subject set not null,
  alter column unit set not null;

drop index if exists curriculum_sources_class_idx;
create index if not exists curriculum_sources_origin_class_idx
  on curriculum_sources (origin_class_id, created_at desc);
create index if not exists curriculum_sources_library_idx
  on curriculum_sources (grade, subject, status, created_at desc);

create table if not exists curriculum_source_selections (
  class_id uuid not null references classes(id) on delete cascade,
  source_id uuid not null references curriculum_sources(id) on delete cascade,
  selected_by uuid references teacher_profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  primary key (class_id, source_id)
);

create index if not exists curriculum_source_selections_source_idx
  on curriculum_source_selections (source_id);

alter table curriculum_source_selections enable row level security;
revoke all on table curriculum_source_selections from anon, authenticated;
grant all on table curriculum_source_selections to service_role;

alter table curriculum_chunks
  add column if not exists source_id uuid references curriculum_sources(id) on delete cascade;

update curriculum_chunks c
set source_id = s.id
from curriculum_sources s
where c.source_id is null
  and c.source_document = s.source_document
  and (c.class_id = s.origin_class_id or (c.class_id is null and s.origin_class_id is null));

create index if not exists curriculum_chunks_source_id_idx
  on curriculum_chunks (source_id);

insert into curriculum_source_selections (class_id, source_id, selected_by)
select origin_class_id, id, uploaded_by
from curriculum_sources
where origin_class_id is not null and status = 'ready'
on conflict (class_id, source_id) do nothing;

-- Existing successful uploads must have their storage objects removed before publication.
update curriculum_sources
set status = 'cleanup_pending', updated_at = now()
where status in ('ready', 'superseded') and storage_deleted_at is null;

begin;
drop function if exists match_curriculum_chunks(vector, integer, text, text, integer, uuid);
drop function if exists match_curriculum_chunks(vector, integer, text, text, integer, uuid[]);

create or replace function match_curriculum_chunks(
  query_embedding vector(768),
  match_grade integer,
  match_subject text,
  match_unit text default null,
  match_count integer default 3,
  match_source_ids uuid[] default null
)
returns table (
  id uuid,
  source_id uuid,
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
    c.source_id,
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
  left join curriculum_sources s on s.id = c.source_id
  where c.grade = match_grade
    and c.subject = match_subject
    and (
      (coalesce(cardinality(match_source_ids), 0) > 0 and c.source_id = any(match_source_ids) and s.status = 'ready')
      or
      (coalesce(cardinality(match_source_ids), 0) = 0 and c.source_id is null and c.class_id is null)
    )
    and (
      coalesce(cardinality(match_source_ids), 0) > 0
      or match_unit is null
      or c.unit = match_unit
    )
  order by
    c.embedding <=> query_embedding,
    c.objective_code asc,
    c.source_page_start asc nulls last,
    c.chunk_index asc nulls last,
    c.id asc
  limit match_count;
$$;

drop function if exists replace_curriculum_source(uuid, text, jsonb);
drop function if exists replace_curriculum_source(uuid, uuid, text, jsonb);

create or replace function replace_curriculum_source(
  p_source_id uuid,
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
  if p_rows is null or jsonb_typeof(p_rows) <> 'array' or jsonb_array_length(p_rows) = 0 then
    raise exception 'replace_curriculum_source: rows must be a non-empty array';
  end if;
  if jsonb_array_length(p_rows) > 1000 then
    raise exception 'replace_curriculum_source: at most 1000 rows allowed';
  end if;
  if exists (
    select 1 from jsonb_array_elements(p_rows) as item(row_data)
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
    select 1 from jsonb_array_elements(p_rows) as item(row_data)
    group by row_data->>'content_hash' having count(*) > 1
  ) then
    raise exception 'replace_curriculum_source: duplicate content_hash values in batch';
  end if;

  if p_source_id is not null then
    delete from curriculum_chunks where source_id = p_source_id;
  elsif p_class_id is null then
    delete from curriculum_chunks where class_id is null and source_id is null and source_document = p_source_document;
  else
    delete from curriculum_chunks where class_id = p_class_id and source_id is null and source_document = p_source_document;
  end if;

  insert into curriculum_chunks (
    source_id, class_id, grade, subject, unit, objective_code, text, embedding,
    source_document, source_page_start, source_page_end, section_title, chunk_index, content_hash
  )
  select
    p_source_id,
    p_class_id,
    (row_data->>'grade')::integer,
    row_data->>'subject',
    row_data->>'unit',
    row_data->>'objective_code',
    row_data->>'text',
    ('[' || (
      select string_agg(value::text, ',' order by ordinality)
      from jsonb_array_elements(row_data->'embedding') with ordinality as embedding_value(value, ordinality)
    ) || ']')::vector(768),
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

create or replace function replace_class_curriculum_selections(
  p_class_id uuid,
  p_selected_by uuid,
  p_source_ids uuid[]
)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  selected_count integer;
  class_grade integer;
  class_subject text;
begin
  if coalesce(cardinality(p_source_ids), 0) > 50 then
    raise exception 'replace_class_curriculum_selections: at most 50 sources allowed';
  end if;
  if coalesce(cardinality(p_source_ids), 0) <> (
    select count(distinct source_id) from unnest(coalesce(p_source_ids, array[]::uuid[])) as source_id
  ) then
    raise exception 'replace_class_curriculum_selections: duplicate source ids';
  end if;

  select grade, subject into class_grade, class_subject from classes where id = p_class_id;
  if not found then raise exception 'replace_class_curriculum_selections: class not found'; end if;

  if exists (
    select 1
    from unnest(coalesce(p_source_ids, array[]::uuid[])) requested(source_id)
    left join curriculum_sources s on s.id = requested.source_id
    where s.id is null
      or s.grade <> class_grade
      or s.subject <> class_subject
      or (
        s.status <> 'ready'
        and not exists (
          select 1
          from curriculum_source_selections existing
          where existing.class_id = p_class_id
            and existing.source_id = requested.source_id
        )
      )
  ) then
    raise exception 'replace_class_curriculum_selections: source unavailable or incompatible';
  end if;

  delete from curriculum_source_selections where class_id = p_class_id;
  insert into curriculum_source_selections (class_id, source_id, selected_by)
  select p_class_id, source_id, p_selected_by
  from unnest(coalesce(p_source_ids, array[]::uuid[])) as source_id;
  get diagnostics selected_count = row_count;
  return selected_count;
end;
$$;

revoke all on function match_curriculum_chunks(vector, integer, text, text, integer, uuid[]) from public, anon, authenticated;
grant execute on function match_curriculum_chunks(vector, integer, text, text, integer, uuid[]) to service_role;
revoke all on function replace_curriculum_source(uuid, uuid, text, jsonb) from public, anon, authenticated;
grant execute on function replace_curriculum_source(uuid, uuid, text, jsonb) to service_role;
revoke all on function replace_class_curriculum_selections(uuid, uuid, uuid[]) from public, anon, authenticated;
grant execute on function replace_class_curriculum_selections(uuid, uuid, uuid[]) to service_role;
commit;
