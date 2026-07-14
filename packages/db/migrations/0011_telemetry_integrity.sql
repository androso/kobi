-- Durable, idempotent student telemetry with server-authored time and atomic completion.
alter table events add column if not exists event_id uuid;
update events set event_id = gen_random_uuid() where event_id is null;
alter table events alter column event_id set not null;

create unique index if not exists events_assignment_event_id_unique
  on events (assignment_id, event_id);
create index if not exists events_assignment_ts_idx
  on events (assignment_id, ts desc);
create index if not exists assignments_student_completed_at_idx
  on assignments (student_id, completed_at desc);

drop function if exists record_student_activity_event(uuid, uuid, text, event_type, jsonb);
drop function if exists complete_assignment_for_student(uuid, uuid, text, real, timestamptz);

create or replace function record_student_activity_event(
  input_assignment_id uuid,
  input_student_id uuid,
  input_access_token text,
  input_event_id uuid,
  input_type event_type,
  input_payload jsonb
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  activity_manifest jsonb;
  activity_bundle_html text;
  item_count integer;
  legacy_answer_total integer;
  legacy_total_allowed boolean;
  item_index integer;
  hint_index integer;
  raw_score numeric;
  raw_total numeric;
  normalized_score numeric;
begin
  perform assert_student_delivery_access(input_student_id, input_access_token);

  -- The row lock serializes the rate check and completion update for this assignment.
  select activities.manifest, activity_bundles.index_html
    into activity_manifest, activity_bundle_html
    from assignments
    join activities on activities.id = assignments.activity_id
    join activity_bundles on activity_bundles.ref = activities.bundle_ref
   where assignments.id = input_assignment_id
     and assignments.student_id = input_student_id
   for update of assignments;

  if not found then
    raise insufficient_privilege using message = 'Assignment is not owned by this student';
  end if;

  -- A timed-out retry is successful and consumes no additional rate capacity.
  if exists (
    select 1 from events
     where assignment_id = input_assignment_id
       and event_id = input_event_id
  ) then
    return;
  end if;

  if (
    select count(*) from events
     where assignment_id = input_assignment_id
       and ts >= clock_timestamp() - interval '1 minute'
  ) >= 30 then
    raise exception using errcode = 'P0001', message = 'telemetry rate limit exceeded';
  end if;

  item_count := jsonb_array_length(activity_manifest #> '{content,items}');
  legacy_answer_total := jsonb_array_length(
    activity_manifest #> '{content,items,0,answer_key}'
  );
  -- Bundles created before the item-count contract used the answer-key length.
  -- Keep those assignments completable while new candidates are held to the
  -- canonical expression by the generator prompt and deterministic verifier.
  legacy_total_allowed := activity_bundle_html ~* E'total\\s*:\\s*manifest\\s*\\.\\s*content\\s*\\.\\s*items\\s*\\[\\s*0\\s*\\]\\s*\\.\\s*answer_key\\s*\\.\\s*length';

  if activity_manifest #> '{content,telemetry_events}' is not null
     and not (activity_manifest #> '{content,telemetry_events}') ? input_type::text then
    raise exception using errcode = '22023', message = 'event type is not enabled by the activity manifest';
  end if;

  if input_type in ('attempt', 'hint') then
    if jsonb_typeof(input_payload -> 'item_index') is distinct from 'number'
       or (input_payload ->> 'item_index')::numeric <> trunc((input_payload ->> 'item_index')::numeric) then
      raise exception using errcode = '22023', message = 'item_index must be an integer';
    end if;
    item_index := (input_payload ->> 'item_index')::integer;
    if item_index < 0 or item_index >= item_count then
      raise exception using errcode = '22023', message = 'item_index is outside the activity manifest';
    end if;
  end if;

  if input_type = 'attempt' and jsonb_typeof(input_payload -> 'correct') <> 'boolean' then
    raise exception using errcode = '22023', message = 'attempt correct must be boolean';
  end if;

  if input_type = 'hint' then
    if jsonb_typeof(input_payload -> 'hint_index') is distinct from 'number'
       or (input_payload ->> 'hint_index')::numeric <> trunc((input_payload ->> 'hint_index')::numeric) then
      raise exception using errcode = '22023', message = 'hint_index must be an integer';
    end if;
    hint_index := (input_payload ->> 'hint_index')::integer;
    if hint_index < 0 or hint_index >= jsonb_array_length(activity_manifest #> array['content', 'items', item_index::text, 'hints']) then
      raise exception using errcode = '22023', message = 'hint_index is outside the activity manifest';
    end if;
  end if;

  if input_type = 'complete' then
    if jsonb_typeof(input_payload -> 'score') is distinct from 'number'
       or jsonb_typeof(input_payload -> 'total') is distinct from 'number' then
      raise exception using errcode = '22023', message = 'completion score and total must be numeric';
    end if;
    raw_score := (input_payload ->> 'score')::numeric;
    raw_total := (input_payload ->> 'total')::numeric;
    if raw_total <= 0
       or (
         raw_total <> item_count
         and not (legacy_total_allowed and raw_total = legacy_answer_total)
       )
       or raw_score < 0
       or raw_score > raw_total then
      raise exception using errcode = '22023', message = 'completion score is outside the activity manifest bounds';
    end if;
    normalized_score := raw_score / raw_total;
    input_payload := input_payload || jsonb_build_object('normalized_score', normalized_score);
  end if;

  insert into events (assignment_id, event_id, type, payload, ts)
  values (input_assignment_id, input_event_id, input_type, input_payload, clock_timestamp());

  if input_type = 'complete' then
    update assignments
       set status = 'completed',
           score = normalized_score::real,
           completed_at = clock_timestamp()
     where id = input_assignment_id;
  end if;
end;
$$;

grant execute on function record_student_activity_event(uuid, uuid, text, uuid, event_type, jsonb)
  to anon, authenticated;
