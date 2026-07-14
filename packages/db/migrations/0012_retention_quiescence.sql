alter table public.sessions
  add column if not exists classroom_data_deletion_requested_at timestamptz;

create index if not exists sessions_classroom_data_deletion_requested_idx
  on public.sessions (classroom_data_deletion_requested_at)
  where classroom_data_deletion_requested_at is not null;

create or replace function public.insert_audio_chunk_if_not_deleted(
  p_session_id uuid,
  p_chunk_index integer,
  p_storage_path text,
  p_start_ms integer,
  p_end_ms integer
)
returns table (id uuid)
language plpgsql
security definer
set search_path = public
as $$
declare
  deletion_requested_at timestamptz;
begin
  select s.classroom_data_deletion_requested_at
    into deletion_requested_at
    from public.sessions s
   where s.id = p_session_id
   for update;

  if not found then
    raise exception 'Session not found';
  end if;

  if deletion_requested_at is not null then
    return;
  end if;

  return query
    insert into public.audio_chunks (session_id, chunk_index, storage_path, start_ms, end_ms, status)
    values (p_session_id, p_chunk_index, p_storage_path, p_start_ms, p_end_ms, 'pending')
    returning audio_chunks.id;
end;
$$;

revoke all on function public.insert_audio_chunk_if_not_deleted(uuid, integer, text, integer, integer) from public;
grant execute on function public.insert_audio_chunk_if_not_deleted(uuid, integer, text, integer, integer) to service_role;
