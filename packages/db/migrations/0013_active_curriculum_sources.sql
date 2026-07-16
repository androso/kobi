begin;

-- Existing superseded uploads must stop contributing retrieval evidence immediately.
delete from curriculum_chunks c
using curriculum_sources s
where c.class_id = s.class_id
  and c.source_document = s.source_document
  and s.status = 'superseded';

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
  left join curriculum_sources s
    on s.class_id = c.class_id
   and s.source_document = c.source_document
  where c.grade = match_grade
    and c.subject = match_subject
    and (match_unit is null or c.unit = match_unit)
    and (
      (match_class_id is null and c.class_id is null)
      or (
        match_class_id is not null
        and c.class_id = match_class_id
        and s.status = 'ready'
      )
    )
  order by
    c.embedding <=> query_embedding,
    c.objective_code asc,
    c.source_page_start asc nulls last,
    c.chunk_index asc nulls last,
    c.id asc
  limit match_count;
$$;

create or replace function finalize_curriculum_source_ingest(
  p_source_id uuid,
  p_class_id uuid,
  p_page_count integer,
  p_chunks_built integer
)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  deleted_count integer;
begin
  if not exists (
    select 1
    from curriculum_sources
    where id = p_source_id
      and class_id = p_class_id
  ) then
    raise exception 'finalize_curriculum_source_ingest: source not found for class';
  end if;

  update curriculum_sources
  set status = 'ready',
      error_message = null,
      page_count = p_page_count,
      chunks_built = p_chunks_built,
      updated_at = now()
  where id = p_source_id
    and class_id = p_class_id;

  with superseded as (
    update curriculum_sources
    set status = 'superseded',
        error_message = null,
        updated_at = now()
    where class_id = p_class_id
      and id <> p_source_id
      and status not in ('failed', 'superseded')
    returning source_document
  )
  delete from curriculum_chunks c
  using superseded s
  where c.class_id = p_class_id
    and c.source_document = s.source_document;

  get diagnostics deleted_count = row_count;
  return deleted_count;
end;
$$;

revoke all on function match_curriculum_chunks(vector, integer, text, text, integer, uuid) from public, anon, authenticated;
grant execute on function match_curriculum_chunks(vector, integer, text, text, integer, uuid) to service_role;
revoke all on function finalize_curriculum_source_ingest(uuid, uuid, integer, integer) from public, anon, authenticated;
grant execute on function finalize_curriculum_source_ingest(uuid, uuid, integer, integer) to service_role;

commit;
