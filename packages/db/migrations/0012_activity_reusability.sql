alter type activity_source add value if not exists 'adapted';

alter table activities
  add column if not exists activity_set_id text;

create index if not exists activities_activity_set_idx on activities(activity_set_id);

create table if not exists public.activity_generation_attempts (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references public.sessions(id) on delete cascade,
  provider text not null check (provider = 'openai'),
  activity_set_id text not null,
  created_at timestamptz not null default now(),
  constraint activity_generation_attempts_session_set_provider_unique
    unique (session_id, activity_set_id, provider)
);

create index if not exists activity_generation_attempts_session_provider_idx
  on public.activity_generation_attempts(session_id, provider, created_at);

alter table public.activity_generation_attempts enable row level security;
revoke all on public.activity_generation_attempts from anon, authenticated;
grant all on public.activity_generation_attempts to service_role;

create or replace function public.claim_openai_activity_generation_attempt(
  input_session_id uuid,
  input_activity_set_id text,
  input_limit integer
)
returns boolean
language plpgsql
security definer
set search_path = pg_catalog
as $$
declare
  attempt_count integer;
begin
  if input_limit <= 0 then
    return false;
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(input_session_id::text, 1)
  );

  select count(*)
    into attempt_count
    from public.activity_generation_attempts
   where session_id = input_session_id
     and provider = 'openai';

  if attempt_count >= input_limit then
    return false;
  end if;

  insert into public.activity_generation_attempts (
    session_id,
    provider,
    activity_set_id
  ) values (
    input_session_id,
    'openai',
    input_activity_set_id
  );

  return true;
end;
$$;

revoke all on function public.claim_openai_activity_generation_attempt(uuid, text, integer)
  from public, anon, authenticated;
grant execute on function public.claim_openai_activity_generation_attempt(uuid, text, integer)
  to service_role;

alter table assignments
  drop constraint if exists assignments_score_normalized;

alter table assignments
  add constraint assignments_score_normalized
  check (score is null or (score >= 0 and score <= 1)) not valid;

create or replace function public.update_activity_outcome_once()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog
as $$
declare
  normalized_score real;
begin
  if old.status = 'completed' and (
    new.status is distinct from old.status
    or new.score is distinct from old.score
    or new.completed_at is distinct from old.completed_at
  ) then
    -- Republishing uses an upsert that proposes status = 'assigned' for every
    -- student. Preserve the completed row atomically instead of aborting the
    -- entire roster update; returning OLD also prevents activity/band changes.
    return old;
  end if;

  if new.status = 'completed' and old.status is distinct from 'completed' then
    if new.score is null then
      raise check_violation using message = 'Completed assignments require a normalized score';
    end if;

    normalized_score := greatest(0, least(1, new.score));
    update public.activities
      set times_used = times_used + 1,
          avg_score = case
            when avg_score is null then normalized_score
            else ((avg_score * times_used) + normalized_score) / (times_used + 1)
          end,
          updated_at = now()
      where id = new.activity_id;
  end if;
  return new;
end;
$$;

revoke all on function public.update_activity_outcome_once() from public, anon, authenticated;

drop trigger if exists assignments_activity_outcome_once on assignments;
create trigger assignments_activity_outcome_once
  before update of status, score, completed_at on assignments
  for each row
  execute function public.update_activity_outcome_once();

create or replace function public.replace_session_activity_candidates(
  input_session_id uuid,
  input_candidates jsonb
)
returns void
language plpgsql
security definer
set search_path = pg_catalog
as $$
declare
  candidate_count integer;
  band_count integer;
  inserted_count integer;
begin
  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(input_session_id::text, 0)
  );

  select count(*), count(distinct candidate.difficulty_band)
    into candidate_count, band_count
    from pg_catalog.jsonb_to_recordset(input_candidates)
      as candidate(difficulty_band text);

  if candidate_count <> 3 or band_count <> 3 then
    raise check_violation using message = 'Activity candidate replacement requires exactly three distinct bands';
  end if;

  update public.session_activity_candidates
     set status = 'superseded'
   where session_id = input_session_id
     and status = 'ready';

  insert into public.session_activity_candidates (
    session_id,
    activity_id,
    difficulty_band,
    status,
    source,
    context_snapshot,
    evidence,
    verifier_scores
  )
  select
    input_session_id,
    candidate.activity_id,
    candidate.difficulty_band::public.band,
    'ready'::public.session_activity_candidate_status,
    candidate.source::public.activity_source,
    candidate.context_snapshot,
    candidate.evidence,
    candidate.verifier_scores
  from pg_catalog.jsonb_to_recordset(input_candidates) as candidate(
    activity_id uuid,
    difficulty_band text,
    source text,
    context_snapshot jsonb,
    evidence jsonb,
    verifier_scores jsonb
  );

  get diagnostics inserted_count = row_count;
  if inserted_count <> 3 then
    raise check_violation using message = 'Activity candidate replacement did not insert a complete set';
  end if;
end;
$$;

revoke all on function public.replace_session_activity_candidates(uuid, jsonb)
  from public, anon, authenticated;
grant execute on function public.replace_session_activity_candidates(uuid, jsonb)
  to service_role;
