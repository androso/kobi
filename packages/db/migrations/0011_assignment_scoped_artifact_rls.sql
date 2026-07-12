-- Replace the temporary artifact-delivery bridge with assignment/class-scoped
-- browser access. The worker uses service_role and bypasses these policies.

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

-- Teachers may read only bundles referenced by candidates or assignments in
-- classes they own. Auth-lite students receive bundle HTML through the checked
-- load_latest_assignment_for_student RPC instead of direct table access.
drop policy if exists activity_bundles_read_for_delivery on activity_bundles;
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

drop policy if exists activities_read_for_delivery on activities;
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

-- Candidate creation is worker-owned. Teachers retain the read and approval
-- update paths needed by the hard approval gate, scoped to their own classes.
drop policy if exists session_activity_candidates_teacher_write on session_activity_candidates;
drop policy if exists session_activity_candidates_teacher_update on session_activity_candidates;
revoke insert, update, delete on session_activity_candidates from anon, authenticated;
grant update (status, approved_at) on session_activity_candidates to authenticated;
create policy session_activity_candidates_teacher_update
  on session_activity_candidates
  for update
  to authenticated
  using (
    exists (
      select 1
        from sessions
        join classes on classes.id = sessions.class_id
       where sessions.id = session_activity_candidates.session_id
         and classes.teacher_id = auth.uid()
    )
  )
  with check (
    exists (
      select 1
        from sessions
        join classes on classes.id = sessions.class_id
       where sessions.id = session_activity_candidates.session_id
         and classes.teacher_id = auth.uid()
    )
  );

-- Student assignment reads and mutations remain RPC-only. Teachers may read
-- and publish assignments only for sessions in classes they own.
drop policy if exists assignments_read_for_delivery on assignments;
drop policy if exists assignments_student_complete_update on assignments;
revoke select, insert, update, delete on assignments from anon;

-- Telemetry inserts are student RPC/service-role owned. Teachers get scoped
-- read access for the live monitor and session report.
drop policy if exists events_insert_for_delivery on events;
drop policy if exists events_teacher_insert on events;
revoke insert, update, delete on events from anon, authenticated;
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
