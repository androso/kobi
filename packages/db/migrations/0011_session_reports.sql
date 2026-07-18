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
      with assignment_scores as (
        select a.status, a.score,
               case
                 when a.status <> 'completed' or a.score is null then null::real
                 else least(greatest(a.score, 0), 1)
               end normalized_score
          from assignments a
         where a.activity_id = input_activity_id
           and a.dismissed_at is null
      )
      select count(*)::integer as times_used,
             avg(normalized_score) filter (where status = 'completed')::real as avg_score
        from assignment_scores
    ) stats
   where activities.id = input_activity_id;
$$;

revoke all on function refresh_activity_repository_stats(uuid) from public;

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

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'sessions'
      and policyname = 'sessions_teacher_update'
  ) then
    create policy sessions_teacher_update
      on sessions
      for update
      to authenticated
      using (
        exists (
          select 1
            from classes
           where classes.id = sessions.class_id
             and classes.teacher_id = auth.uid()
        )
      )
      with check (
        status = 'ended'
        and ended_at is not null
        and exists (
          select 1
            from classes
           where classes.id = sessions.class_id
             and classes.teacher_id = auth.uid()
        )
      );
  end if;
end $$;

create or replace function close_teacher_session(input_session_id uuid)
returns table(id uuid, ended_at timestamptz)
language plpgsql
security invoker
set search_path = public
as $$
begin
  return query
  update sessions as s
     set status = 'ended', ended_at = now()
   where s.id = input_session_id
     and s.status = 'active'
     and exists (
       select 1
         from classes c
        where c.id = s.class_id
          and c.teacher_id = auth.uid()
     )
  returning s.id, s.ended_at;
end;
$$;

revoke all on function close_teacher_session(uuid) from public;
grant execute on function close_teacher_session(uuid) to authenticated;

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
  if input_limit is null or input_offset is null then
    raise invalid_parameter_value using message = 'Report pagination is required';
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
       and s.status = 'ended' and s.ended_at is not null
     order by s.started_at desc
     limit input_limit offset input_offset
  ), segment_summary as (
    select os.id,
           coalesce(array_agg(distinct seg.lesson_state->>'topic') filter (where seg.lesson_state->>'topic' is not null), '{}') topics,
           (array_agg(seg.lesson_state->>'objective_guess' order by seg.created_at desc)
             filter (where seg.lesson_state->>'objective_guess' is not null))[1] objective
      from owned_sessions os left join segments seg on seg.session_id = os.id group by os.id
  ), assignment_scores as (
    select a.id, a.session_id, a.variant, a.status, a.score,
           case
             when a.status <> 'completed' or a.score is null then null::real
             else least(greatest(a.score, 0), 1)
           end normalized_score
      from owned_sessions os
      join assignments a on a.session_id = os.id and a.dismissed_at is null
  ), band_summary as (
    select session_id, variant,
           jsonb_build_object(
             'assigned', count(*)::integer,
             'completed', count(*) filter (where status = 'completed')::integer,
             'average_score', coalesce(avg(normalized_score) filter (where status = 'completed'), 0)::real
           ) outcome
      from assignment_scores
     group by session_id, variant
  ), assignment_totals as (
    select os.id, count(a.id)::integer assignment_count,
           count(a.id) filter (where a.status = 'completed')::integer completed_count,
           coalesce(avg(a.normalized_score) filter (where a.status = 'completed'), 0)::real average_score,
           jsonb_build_object(
             'low', count(a.id) filter (where a.status = 'completed' and a.normalized_score < .6),
             'middle', count(a.id) filter (where a.status = 'completed' and a.normalized_score >= .6 and a.normalized_score < .85),
             'high', count(a.id) filter (where a.status = 'completed' and a.normalized_score >= .85)
           ) score_distribution
      from owned_sessions os
      left join assignment_scores a on a.session_id = os.id
      group by os.id
  ), band_outcomes as (
    select os.id,
           coalesce(jsonb_object_agg(b.variant, b.outcome) filter (where b.variant is not null), '{}'::jsonb) band_outcomes
      from owned_sessions os
      left join band_summary b on b.session_id = os.id
     group by os.id
  ), assignment_summary as (
    select totals.id, totals.assignment_count, totals.completed_count, totals.average_score,
           totals.score_distribution, bands.band_outcomes
      from assignment_totals totals
      join band_outcomes bands on bands.id = totals.id
  ), hint_summary as (
    select a.session_id, count(*)::integer hints
      from owned_sessions os
      join assignments a on a.session_id = os.id and a.dismissed_at is null
      join events e on e.assignment_id = a.id and e.type = 'hint'
     group by a.session_id
  ), difficult_item_summary as (
    select a.session_id, a.activity_id, a.candidate_id, a.variant,
           attempt.item_index, count(*)::integer incorrect_attempts
      from owned_sessions os
      join assignments a on a.session_id = os.id and a.dismissed_at is null
      join events e on e.assignment_id = a.id and e.type = 'attempt'
      join lateral (
        select case
                 when jsonb_typeof(e.payload->'item_index') = 'number'
                  and (e.payload->>'item_index') ~ '^[0-9]+$'
                  and (e.payload->>'item_index')::numeric between 0 and 2147483647
                 then (e.payload->>'item_index')::integer
               end item_index
      ) attempt on true
     where jsonb_typeof(e.payload->'correct') = 'boolean'
       and (e.payload->>'correct')::boolean = false
       and attempt.item_index is not null
     group by a.session_id, a.activity_id, a.candidate_id, a.variant, attempt.item_index
  ), event_summary as (
    select os.id,
      coalesce(h.hints, 0) hints,
      coalesce(jsonb_agg(jsonb_build_object(
        'activity_id', d.activity_id, 'candidate_id', d.candidate_id, 'variant', d.variant,
        'item_index', d.item_index, 'incorrect_attempts', d.incorrect_attempts)
        order by d.incorrect_attempts desc) filter (where d.item_index is not null), '[]'::jsonb) difficult_items
    from owned_sessions os
    left join hint_summary h on h.session_id = os.id
    left join difficult_item_summary d on d.session_id = os.id
    group by os.id, h.hints
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
