-- Publish a complete candidate decision and its student assignments atomically.

alter table session_activity_candidates
  add column if not exists candidate_set_version uuid;

with versions as materialized (
  select session_id, gen_random_uuid() as version
    from session_activity_candidates where candidate_set_version is null group by session_id
)
update session_activity_candidates candidate
   set candidate_set_version = versions.version
  from versions
 where candidate.session_id = versions.session_id and candidate.candidate_set_version is null;

alter table session_activity_candidates
  alter column candidate_set_version set default gen_random_uuid(),
  alter column candidate_set_version set not null;

create index if not exists session_activity_candidates_set_version_idx
  on session_activity_candidates(session_id, candidate_set_version);

create table if not exists assignment_publish_audits (
  id uuid primary key default gen_random_uuid(),
  teacher_id uuid not null references teacher_profiles(id) on delete cascade,
  class_id uuid not null references classes(id) on delete cascade,
  session_id uuid not null references sessions(id) on delete cascade,
  candidate_set_version uuid not null,
  idempotency_key text not null,
  request_hash text not null,
  result jsonb not null,
  created_at timestamptz not null default now(),
  unique (teacher_id, idempotency_key)
);

alter table assignment_publish_audits enable row level security;

drop policy if exists assignment_publish_audits_teacher_read on assignment_publish_audits;
create policy assignment_publish_audits_teacher_read
  on assignment_publish_audits for select to authenticated
  using (teacher_id = auth.uid());

create or replace function publish_session_assignments(
  input_class_id uuid,
  input_session_id uuid,
  input_candidate_set_version uuid,
  input_candidates jsonb,
  input_assignments jsonb,
  input_idempotency_key text,
  input_fail_after_step text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  actor_teacher_id uuid := auth.uid();
  request_hash text;
  stored_audit record;
  candidate_count integer;
  assignment_count integer;
  result jsonb;
begin
  if actor_teacher_id is null then raise insufficient_privilege using message = 'Teacher authentication is required'; end if;
  if nullif(btrim(input_idempotency_key), '') is null then raise invalid_parameter_value using message = 'Idempotency key is required'; end if;

  request_hash := md5(jsonb_build_object(
    'class_id', input_class_id, 'session_id', input_session_id,
    'candidate_set_version', input_candidate_set_version,
    'candidates', input_candidates, 'assignments', input_assignments
  )::text);

  select * into stored_audit from assignment_publish_audits
   where assignment_publish_audits.teacher_id = actor_teacher_id
     and idempotency_key = input_idempotency_key;
  if found then
    if stored_audit.request_hash <> request_hash then raise unique_violation using message = 'Idempotency key was already used for another publish request'; end if;
    return stored_audit.result;
  end if;

  perform 1 from sessions join classes on classes.id = sessions.class_id
   where sessions.id = input_session_id and classes.id = input_class_id
     and classes.teacher_id = actor_teacher_id for update of sessions;
  if not found then raise insufficient_privilege using message = 'Class or session is not owned by the authenticated teacher'; end if;

  if input_fail_after_step = 'ownership' then raise exception 'Injected publish failure after ownership'; end if;

  select count(*) into candidate_count from session_activity_candidates
   where session_id = input_session_id and candidate_set_version = input_candidate_set_version
     and status in ('ready', 'approved');
  if candidate_count <> 3 then raise serialization_failure using message = 'candidate_set_version_conflict'; end if;

  perform 1 from session_activity_candidates
   where session_id = input_session_id and status = 'ready'
     and candidate_set_version <> input_candidate_set_version;
  if found then raise serialization_failure using message = 'candidate_set_version_conflict'; end if;

  if jsonb_typeof(input_candidates) <> 'array' or jsonb_array_length(input_candidates) <> 3 then
    raise check_violation using message = 'Publish requires exactly one candidate decision for each band';
  end if;

  if exists (
    select 1 from jsonb_to_recordset(input_candidates) as requested(candidate_id uuid, difficulty_band text, approved boolean)
    left join session_activity_candidates candidate on candidate.id = requested.candidate_id
    left join activities activity on activity.id = candidate.activity_id
    where candidate.id is null or candidate.session_id <> input_session_id
       or candidate.candidate_set_version <> input_candidate_set_version
       or candidate.difficulty_band::text <> requested.difficulty_band
       or activity.manifest->>'difficulty_band' <> requested.difficulty_band
  ) then raise check_violation using message = 'Candidate does not match the session, version, or manifest band'; end if;

  if (select count(distinct value->>'difficulty_band') from jsonb_array_elements(input_candidates)) <> 3
     or not exists (select 1 from jsonb_array_elements(input_candidates) value where value->>'difficulty_band' = 'core' and (value->>'approved')::boolean)
  then raise check_violation using message = 'Publish requires distinct support/core/challenge decisions and approved core'; end if;

  if input_fail_after_step = 'validation' then raise exception 'Injected publish failure after validation'; end if;

  update session_activity_candidates candidate
     set status = case when requested.approved then 'approved'::session_activity_candidate_status else 'rejected'::session_activity_candidate_status end,
         approved_at = case when requested.approved then now() else null end
    from jsonb_to_recordset(input_candidates) as requested(candidate_id uuid, approved boolean)
   where candidate.id = requested.candidate_id;

  if input_fail_after_step = 'candidates' then raise exception 'Injected publish failure after candidates'; end if;

  if jsonb_typeof(input_assignments) <> 'array' then raise check_violation using message = 'Assignments must be an array'; end if;
  if jsonb_array_length(input_assignments) <> (select count(*) from students where class_id = input_class_id)
     or jsonb_array_length(input_assignments) <> (select count(distinct value->>'student_id') from jsonb_array_elements(input_assignments) value)
  then raise check_violation using message = 'Publish must assign every class student exactly once'; end if;
  if exists (
    select 1 from jsonb_to_recordset(input_assignments) as requested(student_id uuid, candidate_id uuid, activity_id uuid, variant text)
    left join students on students.id = requested.student_id
    left join session_activity_candidates candidate on candidate.id = requested.candidate_id
    where students.id is null or students.class_id <> input_class_id
       or candidate.id is null or candidate.session_id <> input_session_id
       or candidate.candidate_set_version <> input_candidate_set_version
       or candidate.status <> 'approved' or candidate.activity_id <> requested.activity_id
       or candidate.difficulty_band::text <> requested.variant
  ) then raise check_violation using message = 'Assignment student or candidate is outside the approved class/session set'; end if;

  insert into assignments(session_id, candidate_id, activity_id, student_id, variant, status, dismissed_at)
  select input_session_id, requested.candidate_id, requested.activity_id, requested.student_id,
         requested.variant::band, 'assigned'::assignment_status, null
    from jsonb_to_recordset(input_assignments) as requested(student_id uuid, candidate_id uuid, activity_id uuid, variant text)
  on conflict (session_id, student_id) do update set
    candidate_id = excluded.candidate_id, activity_id = excluded.activity_id,
    variant = excluded.variant, status = excluded.status, dismissed_at = null;

  if input_fail_after_step = 'assignments' then raise exception 'Injected publish failure after assignments'; end if;

  select count(*) into assignment_count from assignments where session_id = input_session_id;
  result := jsonb_build_object(
    'session_id', input_session_id, 'candidate_set_version', input_candidate_set_version,
    'assignments', coalesce((select jsonb_agg(jsonb_build_object('id', a.id, 'session_id', a.session_id, 'activity_id', a.activity_id, 'student_id', a.student_id, 'variant', a.variant) order by a.student_id) from assignments a where a.session_id = input_session_id), '[]'::jsonb),
    'assignment_count', assignment_count
  );

  insert into assignment_publish_audits(teacher_id, class_id, session_id, candidate_set_version, idempotency_key, request_hash, result)
  values (actor_teacher_id, input_class_id, input_session_id, input_candidate_set_version, input_idempotency_key, request_hash, result);

  if input_fail_after_step = 'audit' then raise exception 'Injected publish failure after audit'; end if;
  return result;
end;
$$;

revoke all on function publish_session_assignments(uuid, uuid, uuid, jsonb, jsonb, text, text) from public;
grant execute on function publish_session_assignments(uuid, uuid, uuid, jsonb, jsonb, text, text) to authenticated;
