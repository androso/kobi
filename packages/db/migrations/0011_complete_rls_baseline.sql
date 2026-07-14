-- Repository-owned authorization baseline for every application table.
-- service_role bypasses RLS in Supabase and owns worker/ingestion writes;
-- browser roles receive only the table privileges listed below.

alter table teacher_profiles enable row level security;
alter table classes enable row level security;
alter table students enable row level security;
alter table student_profiles enable row level security;
alter table sessions enable row level security;
alter table audio_chunks enable row level security;
alter table segments enable row level security;
alter table checkpoints enable row level security;
alter table curriculum_chunks enable row level security;
alter table activity_bundles enable row level security;
alter table activities enable row level security;
alter table session_activity_candidates enable row level security;
alter table assignments enable row level security;
alter table events enable row level security;

revoke all on all tables in schema public from anon, authenticated;
revoke all on all sequences in schema public from anon, authenticated;
grant all on all tables in schema public to service_role;
grant all on all sequences in schema public to service_role;

grant select, insert, update on teacher_profiles to authenticated;
grant select, insert, update on classes to authenticated;
grant select on students to authenticated;
grant select, insert, update on student_profiles to authenticated;
grant select, insert, update on sessions to authenticated;
grant select on segments to authenticated;
grant select on activity_bundles to authenticated;
grant select on activities to authenticated;
grant select, update on session_activity_candidates to authenticated;
grant select, insert, update on assignments to authenticated;
grant select on events to authenticated;

-- Remove every existing policy from the repository-owned tables before
-- installing the final matrix. This also removes dashboard-created policies
-- with unknown names whose permissive predicates would otherwise combine with
-- these policies under PostgreSQL's OR semantics.
do $$
declare
  policy_record record;
begin
  for policy_record in
    select schemaname, tablename, policyname
    from pg_policies
    where schemaname = 'public'
      and tablename = any (array[
        'teacher_profiles',
        'classes',
        'students',
        'student_profiles',
        'sessions',
        'audio_chunks',
        'segments',
        'checkpoints',
        'curriculum_chunks',
        'activity_bundles',
        'activities',
        'session_activity_candidates',
        'assignments',
        'events'
      ]::text[])
  loop
    execute format(
      'drop policy if exists %I on %I.%I',
      policy_record.policyname,
      policy_record.schemaname,
      policy_record.tablename
    );
  end loop;
end
$$;

create policy teacher_profiles_own_select
  on teacher_profiles for select to authenticated
  using (id = auth.uid());

create policy teacher_profiles_own_insert
  on teacher_profiles for insert to authenticated
  with check (id = auth.uid());

create policy teacher_profiles_own_update
  on teacher_profiles for update to authenticated
  using (id = auth.uid()) with check (id = auth.uid());

create policy classes_teacher_select
  on classes for select to authenticated
  using (teacher_id = auth.uid());

create policy classes_teacher_insert
  on classes for insert to authenticated
  with check (teacher_id = auth.uid());

create policy classes_teacher_update
  on classes for update to authenticated
  using (teacher_id = auth.uid()) with check (teacher_id = auth.uid());

create policy students_teacher_select
  on students for select to authenticated
  using (exists (
    select 1 from classes
    where classes.id = students.class_id
      and classes.teacher_id = auth.uid()
  ));

create policy student_profiles_teacher_select
  on student_profiles for select to authenticated
  using (exists (
    select 1 from students
    join classes on classes.id = students.class_id
    where students.id = student_profiles.student_id
      and classes.teacher_id = auth.uid()
  ));

create policy student_profiles_teacher_insert
  on student_profiles for insert to authenticated
  with check (exists (
    select 1 from students
    join classes on classes.id = students.class_id
    where students.id = student_profiles.student_id
      and classes.teacher_id = auth.uid()
  ));

create policy student_profiles_teacher_update
  on student_profiles for update to authenticated
  using (exists (
    select 1 from students
    join classes on classes.id = students.class_id
    where students.id = student_profiles.student_id
      and classes.teacher_id = auth.uid()
  ))
  with check (exists (
    select 1 from students
    join classes on classes.id = students.class_id
    where students.id = student_profiles.student_id
      and classes.teacher_id = auth.uid()
  ));

create policy sessions_teacher_select
  on sessions for select to authenticated
  using (exists (
    select 1 from classes
    where classes.id = sessions.class_id
      and classes.teacher_id = auth.uid()
  ));

create policy sessions_teacher_insert
  on sessions for insert to authenticated
  with check (exists (
    select 1 from classes
    where classes.id = sessions.class_id
      and classes.teacher_id = auth.uid()
  ));

create policy sessions_teacher_update
  on sessions for update to authenticated
  using (exists (
    select 1 from classes
    where classes.id = sessions.class_id
      and classes.teacher_id = auth.uid()
  ))
  with check (exists (
    select 1 from classes
    where classes.id = sessions.class_id
      and classes.teacher_id = auth.uid()
  ));

create policy segments_teacher_select
  on segments for select to authenticated
  using (exists (
    select 1 from sessions
    join classes on classes.id = sessions.class_id
    where sessions.id = segments.session_id
      and classes.teacher_id = auth.uid()
  ));

create policy candidates_teacher_select
  on session_activity_candidates for select to authenticated
  using (exists (
    select 1 from sessions
    join classes on classes.id = sessions.class_id
    where sessions.id = session_activity_candidates.session_id
      and classes.teacher_id = auth.uid()
  ));

create policy candidates_teacher_update
  on session_activity_candidates for update to authenticated
  using (exists (
    select 1 from sessions
    join classes on classes.id = sessions.class_id
    where sessions.id = session_activity_candidates.session_id
      and classes.teacher_id = auth.uid()
  ))
  with check (exists (
    select 1 from sessions
    join classes on classes.id = sessions.class_id
    where sessions.id = session_activity_candidates.session_id
      and classes.teacher_id = auth.uid()
  ));

create policy activities_teacher_select
  on activities for select to authenticated
  using (exists (
    select 1 from session_activity_candidates
    join sessions on sessions.id = session_activity_candidates.session_id
    join classes on classes.id = sessions.class_id
    where session_activity_candidates.activity_id = activities.id
      and classes.teacher_id = auth.uid()
  ));

create policy activity_bundles_teacher_select
  on activity_bundles for select to authenticated
  using (exists (
    select 1 from activities
    join session_activity_candidates
      on session_activity_candidates.activity_id = activities.id
    join sessions on sessions.id = session_activity_candidates.session_id
    join classes on classes.id = sessions.class_id
    where activities.bundle_ref = activity_bundles.ref
      and classes.teacher_id = auth.uid()
  ));

create policy assignments_teacher_select
  on assignments for select to authenticated
  using (exists (
    select 1 from sessions
    join classes on classes.id = sessions.class_id
    where sessions.id = assignments.session_id
      and classes.teacher_id = auth.uid()
  ));

create policy assignments_teacher_insert
  on assignments for insert to authenticated
  with check (exists (
    select 1 from sessions
    join classes on classes.id = sessions.class_id
    where sessions.id = assignments.session_id
      and classes.teacher_id = auth.uid()
  ));

create policy assignments_teacher_update
  on assignments for update to authenticated
  using (exists (
    select 1 from sessions
    join classes on classes.id = sessions.class_id
    where sessions.id = assignments.session_id
      and classes.teacher_id = auth.uid()
  ))
  with check (exists (
    select 1 from sessions
    join classes on classes.id = sessions.class_id
    where sessions.id = assignments.session_id
      and classes.teacher_id = auth.uid()
  ));

create policy events_teacher_select
  on events for select to authenticated
  using (exists (
    select 1 from assignments
    join sessions on sessions.id = assignments.session_id
    join classes on classes.id = sessions.class_id
    where assignments.id = events.assignment_id
      and classes.teacher_id = auth.uid()
  ));

-- Student delivery remains RPC-only. Restrict function execution explicitly;
-- PostgreSQL grants new functions to PUBLIC by default.
revoke all on function join_class_by_code(text, text) from public;
revoke all on function load_latest_assignment_for_student(uuid, text) from public;
revoke all on function dismiss_assignment_for_student(uuid, uuid, text, timestamptz) from public;
revoke all on function record_student_activity_event(uuid, uuid, text, event_type, jsonb) from public;
revoke all on function complete_assignment_for_student(uuid, uuid, text, real, timestamptz) from public;

grant execute on function join_class_by_code(text, text) to anon, authenticated;
grant execute on function load_latest_assignment_for_student(uuid, text) to anon, authenticated;
grant execute on function dismiss_assignment_for_student(uuid, uuid, text, timestamptz) to anon, authenticated;
grant execute on function record_student_activity_event(uuid, uuid, text, event_type, jsonb) to anon, authenticated;
grant execute on function complete_assignment_for_student(uuid, uuid, text, real, timestamptz) to anon, authenticated;
