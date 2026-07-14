-- Complete the move from the temporary auth-lite delivery bridge to
-- assignment/class-scoped authenticated access. The worker uses service_role.

alter table activity_bundles enable row level security;
alter table activities enable row level security;
alter table session_activity_candidates enable row level security;
alter table assignments enable row level security;
alter table events enable row level security;

-- Generated artifacts and bundles are worker-owned. Remove every browser write
-- policy introduced by the temporary bridge.
drop policy if exists activity_bundles_authenticated_insert on activity_bundles;
drop policy if exists activity_bundles_authenticated_update on activity_bundles;
drop policy if exists activities_authenticated_insert on activities;
drop policy if exists activities_authenticated_update on activities;
revoke insert, update, delete on activity_bundles from anon, authenticated;
revoke insert, update, delete on activities from anon, authenticated;

-- Preserve the student delivery policies installed by 0010_student_accounts.
-- Teachers may read only bundles and activities connected to their classes.
drop policy if exists activity_bundles_teacher_select on activity_bundles;
create policy activity_bundles_teacher_select
  on activity_bundles
  for select
  to authenticated
  using (
    exists (
      select 1
        from activities
        join session_activity_candidates on session_activity_candidates.activity_id = activities.id
        join sessions on sessions.id = session_activity_candidates.session_id
        join classes on classes.id = sessions.class_id
       where activities.bundle_ref = activity_bundles.ref
         and classes.teacher_id = auth.uid()
    )
    or exists (
      select 1
        from activities
        join assignments on assignments.activity_id = activities.id
        join sessions on sessions.id = assignments.session_id
        join classes on classes.id = sessions.class_id
       where activities.bundle_ref = activity_bundles.ref
         and classes.teacher_id = auth.uid()
    )
  );

drop policy if exists activities_teacher_select on activities;
create policy activities_teacher_select
  on activities
  for select
  to authenticated
  using (
    exists (
      select 1
        from session_activity_candidates
        join sessions on sessions.id = session_activity_candidates.session_id
        join classes on classes.id = sessions.class_id
       where session_activity_candidates.activity_id = activities.id
         and classes.teacher_id = auth.uid()
    )
    or exists (
      select 1
        from assignments
        join sessions on sessions.id = assignments.session_id
        join classes on classes.id = sessions.class_id
       where assignments.activity_id = activities.id
         and classes.teacher_id = auth.uid()
    )
  );

-- Remove legacy auth-lite assignment policies. Authenticated students retain
-- the student-owned policies installed by 0010_student_accounts.
drop policy if exists assignments_read_for_delivery on assignments;
drop policy if exists assignments_student_complete_update on assignments;
revoke select, insert, update, delete on assignments from anon;

-- Remove legacy auth-lite telemetry policies. Authenticated students retain
-- their assignment-scoped insert policy; teachers get scoped read access.
drop policy if exists events_insert_for_delivery on events;
drop policy if exists events_teacher_insert on events;
revoke insert, update, delete on events from anon;
revoke update, delete on events from authenticated;
drop policy if exists events_teacher_select on events;
create policy events_teacher_select
  on events
  for select
  to authenticated
  using (
    exists (
      select 1
        from assignments
        join sessions on sessions.id = assignments.session_id
        join classes on classes.id = sessions.class_id
       where assignments.id = events.assignment_id
         and classes.teacher_id = auth.uid()
    )
  );
