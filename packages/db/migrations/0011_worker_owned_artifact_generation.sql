-- Artifact generation, verification, and candidate persistence are worker-owned.
-- Browser clients may read generated artifacts and approve existing candidates,
-- but may not create or replace generation outputs.

drop policy if exists activity_bundles_authenticated_insert on activity_bundles;
drop policy if exists activity_bundles_authenticated_update on activity_bundles;
drop policy if exists activities_authenticated_insert on activities;
drop policy if exists activities_authenticated_update on activities;

revoke insert, update, delete on activity_bundles from authenticated;
revoke insert, update, delete on activities from authenticated;

drop policy if exists session_activity_candidates_teacher_write on session_activity_candidates;

revoke insert, update, delete on session_activity_candidates from authenticated;
grant update (status, approved_at) on session_activity_candidates to authenticated;

create policy session_activity_candidates_teacher_approve
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
    status in ('approved', 'rejected')
    and exists (
      select 1
        from sessions
        join classes on classes.id = sessions.class_id
       where sessions.id = session_activity_candidates.session_id
         and classes.teacher_id = auth.uid()
    )
  );

grant all on activity_bundles, activities, session_activity_candidates to service_role;
