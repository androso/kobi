-- Give auth-lite students a narrow bearer credential for delivery RPCs.
-- Students do not use Supabase Auth rows, so direct anon table policies cannot
-- distinguish the owning student without this token.

alter table students
  add column if not exists access_token text;

update students
   set access_token = replace(gen_random_uuid()::text, '-', '')
 where access_token is null;

alter table students
  alter column access_token set default replace(gen_random_uuid()::text, '-', '');

alter table students
  alter column access_token set not null;

create unique index if not exists students_access_token_unique
  on students (access_token);

alter table students enable row level security;
alter table sessions enable row level security;
alter table session_activity_candidates enable row level security;
alter table activity_bundles enable row level security;
alter table activities enable row level security;
alter table assignments enable row level security;
alter table events enable row level security;

drop function if exists join_class_by_code(text, text);

create or replace function join_class_by_code(
  input_code text,
  input_display_name text
)
returns table (
  student_id uuid,
  class_id uuid,
  class_name text,
  join_code text,
  display_name text,
  access_token text
)
language plpgsql
security definer
set search_path = public
as $$
declare
  matched_class classes%rowtype;
  created_student students%rowtype;
  normalized_code text := upper(trim(input_code));
  normalized_name text := trim(input_display_name);
begin
  if normalized_code = '' or normalized_name = '' then
    raise exception 'Class code and display name are required'
      using errcode = '22023';
  end if;

  select *
    into matched_class
    from classes
   where classes.join_code = normalized_code
   limit 1;

  if not found then
    raise exception 'Class not found'
      using errcode = 'P0002';
  end if;

  insert into students (class_id, display_name)
  values (matched_class.id, normalized_name)
  returning * into created_student;

  student_id := created_student.id;
  class_id := matched_class.id;
  class_name := matched_class.name;
  join_code := matched_class.join_code;
  display_name := created_student.display_name;
  access_token := created_student.access_token;
  return next;
end;
$$;

grant execute on function join_class_by_code(text, text) to anon, authenticated;

create or replace function assert_student_delivery_access(
  input_student_id uuid,
  input_access_token text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not exists (
    select 1
      from students
     where id = input_student_id
       and access_token = input_access_token
  ) then
    raise insufficient_privilege using message = 'Invalid student delivery token';
  end if;
end;
$$;

revoke all on function assert_student_delivery_access(uuid, text) from public;

create or replace function load_latest_assignment_for_student(
  input_student_id uuid,
  input_access_token text
)
returns table (
  id uuid,
  session_id uuid,
  activity_id uuid,
  student_id uuid,
  variant band,
  status assignment_status,
  manifest jsonb,
  bundle_html text
)
language plpgsql
security definer
set search_path = public
as $$
begin
  perform assert_student_delivery_access(input_student_id, input_access_token);

  return query
    select
      assignments.id,
      assignments.session_id,
      assignments.activity_id,
      assignments.student_id,
      assignments.variant,
      assignments.status,
      activities.manifest,
      activity_bundles.index_html
    from assignments
    join activities on activities.id = assignments.activity_id
    join activity_bundles on activity_bundles.ref = activities.bundle_ref
   where assignments.student_id = input_student_id
     and assignments.dismissed_at is null
   order by assignments.created_at desc
   limit 1;
end;
$$;

grant execute on function load_latest_assignment_for_student(uuid, text) to anon, authenticated;

create or replace function dismiss_assignment_for_student(
  input_assignment_id uuid,
  input_student_id uuid,
  input_access_token text,
  input_dismissed_at timestamptz
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  perform assert_student_delivery_access(input_student_id, input_access_token);

  update assignments
     set dismissed_at = input_dismissed_at
   where id = input_assignment_id
     and student_id = input_student_id;

  if not found then
    raise insufficient_privilege using message = 'Assignment is not owned by this student';
  end if;
end;
$$;

grant execute on function dismiss_assignment_for_student(uuid, uuid, text, timestamptz) to anon, authenticated;

create or replace function record_student_activity_event(
  input_assignment_id uuid,
  input_student_id uuid,
  input_access_token text,
  input_type event_type,
  input_payload jsonb
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  perform assert_student_delivery_access(input_student_id, input_access_token);

  if not exists (
    select 1
      from assignments
     where id = input_assignment_id
       and student_id = input_student_id
  ) then
    raise insufficient_privilege using message = 'Assignment is not owned by this student';
  end if;

  insert into events (assignment_id, type, payload)
  values (input_assignment_id, input_type, input_payload);
end;
$$;

grant execute on function record_student_activity_event(uuid, uuid, text, event_type, jsonb) to anon, authenticated;

create or replace function complete_assignment_for_student(
  input_assignment_id uuid,
  input_student_id uuid,
  input_access_token text,
  input_score real,
  input_completed_at timestamptz
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  perform assert_student_delivery_access(input_student_id, input_access_token);

  update assignments
     set status = 'completed',
         score = input_score,
         completed_at = input_completed_at
   where id = input_assignment_id
     and student_id = input_student_id;

  if not found then
    raise insufficient_privilege using message = 'Assignment is not owned by this student';
  end if;
end;
$$;

grant execute on function complete_assignment_for_student(uuid, uuid, text, real, timestamptz) to anon, authenticated;

drop policy if exists activity_bundles_read_for_delivery on activity_bundles;
create policy activity_bundles_read_for_delivery
  on activity_bundles
  for select
  to authenticated
  using (true);

drop policy if exists activities_read_for_delivery on activities;
create policy activities_read_for_delivery
  on activities
  for select
  to authenticated
  using (true);

drop policy if exists assignments_read_for_delivery on assignments;
drop policy if exists assignments_teacher_read on assignments;
create policy assignments_teacher_read
  on assignments
  for select
  to authenticated
  using (
    exists (
      select 1
        from sessions
        join classes on classes.id = sessions.class_id
       where sessions.id = assignments.session_id
         and classes.teacher_id = auth.uid()
    )
  );

drop policy if exists assignments_student_complete_update on assignments;

drop policy if exists events_insert_for_delivery on events;
drop policy if exists events_teacher_insert on events;
create policy events_teacher_insert
  on events
  for insert
  to authenticated
  with check (
    exists (
      select 1
        from assignments
        join sessions on sessions.id = assignments.session_id
        join classes on classes.id = sessions.class_id
       where assignments.id = events.assignment_id
         and classes.teacher_id = auth.uid()
    )
  );
