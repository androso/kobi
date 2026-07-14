alter table public.segments
  add column if not exists from_chunk_index integer,
  add column if not exists to_chunk_index integer;

-- Existing rows predate durable source boundaries. They cannot be reconstructed,
-- so use negative synthetic ranges with the latest legacy row at -1. The worker
-- uses the greatest preceding boundary for continuity, so this preserves the
-- latest lesson_state after migration.
with legacy as (
  select id, -row_number() over (partition by session_id order by created_at desc, id desc) as synthetic_index
  from public.segments
  where from_chunk_index is null or to_chunk_index is null
)
update public.segments s
set from_chunk_index = legacy.synthetic_index,
    to_chunk_index = legacy.synthetic_index
from legacy
where s.id = legacy.id;

alter table public.segments
  alter column from_chunk_index set not null,
  alter column to_chunk_index set not null;

alter table public.segments
  drop constraint if exists segments_chunk_range_valid,
  add constraint segments_chunk_range_valid check (from_chunk_index <= to_chunk_index);

create unique index if not exists segments_session_chunk_range_unique
  on public.segments (session_id, from_chunk_index, to_chunk_index);

create table if not exists public.lesson_state_claims (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references public.sessions(id) on delete cascade,
  from_chunk_index integer not null,
  to_chunk_index integer not null,
  transcript_text text not null,
  created_at timestamptz not null default now(),
  unique (session_id),
  check (from_chunk_index <= to_chunk_index)
);

alter table public.lesson_state_claims enable row level security;
revoke all privileges on table public.lesson_state_claims from public, anon, authenticated;
grant all privileges on table public.lesson_state_claims to service_role;

create or replace function public.claim_next_lesson_state_range(target_session_id uuid, max_chunks integer default 2)
returns table (
  claim_id uuid,
  from_chunk_index integer,
  to_chunk_index integer,
  transcript_text text,
  previous_lesson_state jsonb,
  grade integer,
  subject text,
  unit text,
  locale text
)
language plpgsql
security definer
set search_path = public
as $$
declare
  next_index integer;
  range_end integer;
begin
  perform pg_advisory_xact_lock(hashtextextended(target_session_id::text, 47));

  return query
  select c.id, c.from_chunk_index, c.to_chunk_index, c.transcript_text,
         s.lesson_state, cl.grade, cl.subject, cl.unit, 'es-SV'::text
  from lesson_state_claims c
  join sessions se on se.id = c.session_id
  join classes cl on cl.id = se.class_id
  left join lateral (
    select seg.lesson_state from segments seg
    where seg.session_id = target_session_id and seg.to_chunk_index < c.from_chunk_index
    order by seg.to_chunk_index desc limit 1
  ) s on true
  where c.session_id = target_session_id;
  if found then return; end if;

  select coalesce(max(s.to_chunk_index) filter (where s.to_chunk_index >= 0), -1) + 1
  into next_index from segments s where s.session_id = target_session_id;

  -- A failed transcription cannot be retried by this job, so consume each
  -- failed source index before looking for the next transcribed range. The
  -- resulting segment begins after the skipped audio and keeps later chunks
  -- from waiting forever on one bad transcription.
  loop
    exit when not exists (
      select 1 from audio_chunks a
      where a.session_id = target_session_id
        and a.chunk_index = next_index
        and a.status = 'failed'
    );
    next_index := next_index + 1;
  end loop;

  if not exists (
    select 1 from audio_chunks a
    where a.session_id = target_session_id and a.chunk_index = next_index and a.status = 'transcribed'
  ) then return; end if;

  select max(candidate.chunk_index) into range_end
  from (
    select a.chunk_index
    from audio_chunks a
    where a.session_id = target_session_id
      and a.status = 'transcribed'
      and a.chunk_index between next_index and next_index + greatest(max_chunks, 1) - 1
      and not exists (
        select 1 from generate_series(next_index, a.chunk_index) expected
        where not exists (
          select 1 from audio_chunks present
          where present.session_id = target_session_id
            and present.chunk_index = expected
            and present.status = 'transcribed'
        )
      )
  ) candidate;

  insert into lesson_state_claims (session_id, from_chunk_index, to_chunk_index, transcript_text)
  select target_session_id, next_index, range_end,
         string_agg(coalesce(a.transcript_text, ''), E'\n' order by a.chunk_index)
  from audio_chunks a
  where a.session_id = target_session_id and a.chunk_index between next_index and range_end
  returning id into claim_id;

  return query
  select claim_id, next_index, range_end,
         c.transcript_text, s.lesson_state, cl.grade, cl.subject, cl.unit, 'es-SV'::text
  from lesson_state_claims c
  join sessions se on se.id = c.session_id
  join classes cl on cl.id = se.class_id
  left join lateral (
    select seg.lesson_state from segments seg
    where seg.session_id = target_session_id and seg.to_chunk_index < next_index
    order by seg.to_chunk_index desc limit 1
  ) s on true
  where c.id = claim_id;
end;
$$;

create or replace function public.finalize_lesson_state_range(
  target_claim_id uuid,
  new_lesson_state jsonb,
  new_confidence real,
  new_transcript_summary text
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare claimed lesson_state_claims%rowtype;
begin
  select * into claimed from lesson_state_claims where id = target_claim_id for update;
  if not found then return false; end if;
  perform pg_advisory_xact_lock(hashtextextended(claimed.session_id::text, 47));

  if exists (
    select 1 from segments
    where session_id = claimed.session_id and to_chunk_index >= claimed.from_chunk_index
  ) then
    delete from lesson_state_claims where id = target_claim_id;
    return false;
  end if;

  if new_lesson_state is not null then
    insert into segments (
      session_id, from_chunk_index, to_chunk_index, lesson_state, confidence, transcript_summary
    ) values (
      claimed.session_id, claimed.from_chunk_index, claimed.to_chunk_index,
      new_lesson_state, new_confidence, new_transcript_summary
    );
  end if;
  delete from lesson_state_claims where id = target_claim_id;
  return true;
end;
$$;

create or replace function public.insert_manual_lesson_state(
  target_session_id uuid,
  new_lesson_state jsonb,
  new_confidence real,
  new_transcript_summary text
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  manual_boundary integer;
  inserted_id uuid;
begin
  perform pg_advisory_xact_lock(hashtextextended(target_session_id::text, 47));

  select coalesce(min(from_chunk_index), 0) - 1
  into manual_boundary
  from segments
  where session_id = target_session_id and from_chunk_index < 0;

  insert into segments (
    session_id, from_chunk_index, to_chunk_index, lesson_state, confidence, transcript_summary
  ) values (
    target_session_id, manual_boundary, manual_boundary,
    new_lesson_state, new_confidence, new_transcript_summary
  )
  returning id into inserted_id;

  return inserted_id;
end;
$$;

revoke all on function public.claim_next_lesson_state_range(uuid, integer) from public;
revoke all on function public.finalize_lesson_state_range(uuid, jsonb, real, text) from public;
revoke all on function public.insert_manual_lesson_state(uuid, jsonb, real, text) from public;
grant execute on function public.claim_next_lesson_state_range(uuid, integer) to service_role;
grant execute on function public.finalize_lesson_state_range(uuid, jsonb, real, text) to service_role;
grant execute on function public.insert_manual_lesson_state(uuid, jsonb, real, text) to service_role;
