-- Durable, teacher-managed student accounts. Existing auth-lite rows remain historical.
alter table students add column if not exists username text;
alter table students add column if not exists auth_user_id uuid;
alter table students add column if not exists is_active boolean not null default false;
alter table students add column if not exists activated_at timestamptz;
alter table students alter column access_token drop not null;

create unique index if not exists students_username_unique on students (lower(username)) where username is not null;
create unique index if not exists students_auth_user_id_unique on students (auth_user_id) where auth_user_id is not null;

drop function if exists join_class_by_code(text, text);
revoke all on function load_latest_assignment_for_student(uuid, text) from anon, authenticated;
revoke all on function dismiss_assignment_for_student(uuid, uuid, text, timestamptz) from anon, authenticated;
revoke all on function record_student_activity_event(uuid, uuid, text, event_type, jsonb) from anon, authenticated;
revoke all on function complete_assignment_for_student(uuid, uuid, text, real, timestamptz) from anon, authenticated;

create or replace function current_student_id() returns uuid
language sql stable security definer set search_path = public
as $$ select id from students where auth_user_id = auth.uid() and is_active = true limit 1 $$;
revoke all on function current_student_id() from public;
grant execute on function current_student_id() to authenticated;

drop policy if exists students_teacher_select on students;
create policy students_teacher_select on students for select to authenticated using (
  auth_user_id = auth.uid() or exists (select 1 from classes where classes.id = students.class_id and classes.teacher_id = auth.uid())
);

create policy assignments_student_read on assignments for select to authenticated using (student_id = current_student_id());
create policy assignments_student_update on assignments for update to authenticated
  using (student_id = current_student_id()) with check (student_id = current_student_id());
create policy events_student_insert on events for insert to authenticated with check (
  exists (select 1 from assignments where assignments.id = events.assignment_id and assignments.student_id = current_student_id())
);

drop policy if exists activity_bundles_read_for_delivery on activity_bundles;
create policy activity_bundles_read_for_delivery on activity_bundles for select to authenticated using (
  exists (select 1 from activities join assignments on assignments.activity_id = activities.id
    where activities.bundle_ref = activity_bundles.ref and assignments.student_id = current_student_id())
  or exists (select 1 from activities join session_activity_candidates c on c.activity_id = activities.id
    join sessions on sessions.id = c.session_id join classes on classes.id = sessions.class_id
    where activities.bundle_ref = activity_bundles.ref and classes.teacher_id = auth.uid())
);

drop policy if exists activities_read_for_delivery on activities;
create policy activities_read_for_delivery on activities for select to authenticated using (
  exists (select 1 from assignments where assignments.activity_id = activities.id and assignments.student_id = current_student_id())
  or exists (select 1 from session_activity_candidates c join sessions on sessions.id = c.session_id
    join classes on classes.id = sessions.class_id where c.activity_id = activities.id and classes.teacher_id = auth.uid())
);
