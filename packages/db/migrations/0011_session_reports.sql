-- Durable, teacher-owned session reports derived from assignments and telemetry.

create or replace function refresh_activity_repository_stats(input_activity_id uuid)
returns void
language sql
security definer
set search_path = public
as $$
  update activities
     set times_used = stats.times_used,
         avg_score = stats.avg_score,
         updated_at = now()
    from (
      select count(*)::integer as times_used,
             avg(score) filter (where status = 'completed' and score is not null)::real as avg_score
        from assignments
       where activity_id = input_activity_id
         and dismissed_at is null
    ) stats
   where activities.id = input_activity_id;
$$;

create or replace function refresh_assignment_activity_stats()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op = 'DELETE' or (tg_op = 'UPDATE' and old.activity_id <> new.activity_id) then
    perform refresh_activity_repository_stats(old.activity_id);
  end if;
  if tg_op <> 'DELETE' then
    perform refresh_activity_repository_stats(new.activity_id);
  end if;
  return coalesce(new, old);
end;
$$;

drop trigger if exists assignments_refresh_activity_stats on assignments;
create trigger assignments_refresh_activity_stats
after insert or update or delete on assignments
for each row execute function refresh_assignment_activity_stats();

-- Backfill from durable facts; rerunning this migration converges to the same values.
update activities set times_used = 0, avg_score = null;
select refresh_activity_repository_stats(id) from activities;

create or replace function list_teacher_session_reports(
  input_class_id uuid default null,
  input_from timestamptz default now() - interval '90 days',
  input_to timestamptz default now(),
  input_limit integer default 20,
  input_offset integer default 0
)
returns table(report jsonb)
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then
    raise insufficient_privilege using message = 'Teacher authentication is required';
  end if;
  if input_from >= input_to or input_to - input_from > interval '366 days' then
    raise invalid_parameter_value using message = 'Report range must be positive and at most 366 days';
  end if;
  if input_limit < 1 or input_limit > 100 or input_offset < 0 then
    raise invalid_parameter_value using message = 'Report pagination is out of bounds';
  end if;
  if input_class_id is not null and not exists (
    select 1 from classes where id = input_class_id and teacher_id = auth.uid()
  ) then
    raise insufficient_privilege using message = 'Class is not owned by this teacher';
  end if;

  return query
  with owned_sessions as (
    select s.*, c.name, c.subject, c.unit,
           count(*) over ()::integer as total_count
      from sessions s join classes c on c.id = s.class_id
     where c.teacher_id = auth.uid()
       and (input_class_id is null or c.id = input_class_id)
       and s.started_at >= input_from and s.started_at < input_to
     order by s.started_at desc
     limit input_limit offset input_offset
  ), segment_summary as (
    select os.id,
           coalesce(array_agg(distinct seg.lesson_state->>'topic') filter (where seg.lesson_state->>'topic' is not null), '{}') topics,
           (array_agg(seg.lesson_state->>'objective_guess' order by seg.created_at desc)
             filter (where seg.lesson_state->>'objective_guess' is not null))[1] objective
      from owned_sessions os left join segments seg on seg.session_id = os.id group by os.id
  ), assignment_summary as (
    select os.id, count(a.id)::integer assignment_count,
           count(a.id) filter (where a.status = 'completed')::integer completed_count,
           coalesce(avg(a.score) filter (where a.status = 'completed'), 0)::real average_score,
           jsonb_build_object(
             'low', count(a.id) filter (where a.status = 'completed' and a.score < .6),
             'middle', count(a.id) filter (where a.status = 'completed' and a.score >= .6 and a.score < .85),
             'high', count(a.id) filter (where a.status = 'completed' and a.score >= .85)
           ) score_distribution,
           coalesce(jsonb_object_agg(a.variant, band.outcome) filter (where a.variant is not null), '{}'::jsonb) band_outcomes
      from owned_sessions os
      left join assignments a on a.session_id = os.id and a.dismissed_at is null
      left join lateral (
        select jsonb_build_object('assigned', count(*)::integer,
          'completed', count(*) filter (where x.status='completed')::integer,
          'average_score', coalesce(avg(x.score) filter (where x.status='completed'),0)::real) outcome
        from assignments x where x.session_id=os.id and x.variant=a.variant and x.dismissed_at is null
      ) band on true
     group by os.id
  ), event_summary as (
    select os.id,
      count(e.id) filter (where e.type='hint')::integer hints,
      coalesce(jsonb_agg(jsonb_build_object('item_index', difficult.item_index, 'incorrect_attempts', difficult.incorrect_attempts)
        order by difficult.incorrect_attempts desc) filter (where difficult.item_index is not null), '[]'::jsonb) difficult_items
    from owned_sessions os
    left join assignments a on a.session_id=os.id and a.dismissed_at is null
    left join events e on e.assignment_id=a.id
    left join lateral (
      select (x.payload->>'item_index')::integer item_index, count(*)::integer incorrect_attempts
      from events x where x.assignment_id=a.id and x.type='attempt'
        and coalesce((x.payload->>'correct')::boolean,false)=false and x.payload ? 'item_index'
      group by x.payload->>'item_index'
    ) difficult on true
    group by os.id
  )
  select jsonb_build_object(
    'id', os.id, 'class_id', os.class_id, 'class_name', os.name, 'subject', os.subject,
    'unit', os.unit, 'status', os.status, 'started_at', os.started_at, 'ended_at', os.ended_at,
    'duration_seconds', greatest(0, extract(epoch from coalesce(os.ended_at, now())-os.started_at)::integer),
    'topics', ss.topics, 'objective', ss.objective, 'assignment_count', coalesce(a.assignment_count,0),
    'completed_count', coalesce(a.completed_count,0),
    'completion_rate', case when coalesce(a.assignment_count,0)=0 then 0 else a.completed_count::real/a.assignment_count end,
    'average_score', coalesce(a.average_score,0), 'score_distribution', coalesce(a.score_distribution,'{}'),
    'hints', coalesce(e.hints,0), 'difficult_items', coalesce(e.difficult_items,'[]'),
    'band_outcomes', coalesce(a.band_outcomes,'{}'), 'total_count', os.total_count
  )
  from owned_sessions os
  left join segment_summary ss on ss.id=os.id
  left join assignment_summary a on a.id=os.id
  left join event_summary e on e.id=os.id
  order by os.started_at desc;
end;
$$;

revoke all on function list_teacher_session_reports(uuid,timestamptz,timestamptz,integer,integer) from public;
grant execute on function list_teacher_session_reports(uuid,timestamptz,timestamptz,integer,integer) to authenticated;
