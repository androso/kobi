-- Browser-side hackathon bridge for artifact delivery.
--
-- The checked-in Drizzle schema does not enable RLS for these tables, but the
-- hosted Supabase project may already have it enabled. These policies make the
-- temporary apps/web artifact bridge work without disabling RLS globally.

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'activity_bundles'
      and policyname = 'activity_bundles_read_for_delivery'
  ) then
    create policy activity_bundles_read_for_delivery
      on activity_bundles
      for select
      to anon, authenticated
      using (true);
  end if;
end $$;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'activity_bundles'
      and policyname = 'activity_bundles_authenticated_insert'
  ) then
    create policy activity_bundles_authenticated_insert
      on activity_bundles
      for insert
      to authenticated
      with check (true);
  end if;
end $$;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'activity_bundles'
      and policyname = 'activity_bundles_authenticated_update'
  ) then
    create policy activity_bundles_authenticated_update
      on activity_bundles
      for update
      to authenticated
      using (true)
      with check (true);
  end if;
end $$;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'activities'
      and policyname = 'activities_read_for_delivery'
  ) then
    create policy activities_read_for_delivery
      on activities
      for select
      to anon, authenticated
      using (true);
  end if;
end $$;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'activities'
      and policyname = 'activities_authenticated_insert'
  ) then
    create policy activities_authenticated_insert
      on activities
      for insert
      to authenticated
      with check (true);
  end if;
end $$;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'activities'
      and policyname = 'activities_authenticated_update'
  ) then
    create policy activities_authenticated_update
      on activities
      for update
      to authenticated
      using (true)
      with check (true);
  end if;
end $$;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'sessions'
      and policyname = 'sessions_teacher_select'
  ) then
    create policy sessions_teacher_select
      on sessions
      for select
      to authenticated
      using (
        exists (
          select 1
            from classes
           where classes.id = sessions.class_id
             and classes.teacher_id = auth.uid()
        )
      );
  end if;
end $$;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'sessions'
      and policyname = 'sessions_teacher_insert'
  ) then
    create policy sessions_teacher_insert
      on sessions
      for insert
      to authenticated
      with check (
        exists (
          select 1
            from classes
           where classes.id = sessions.class_id
             and classes.teacher_id = auth.uid()
        )
      );
  end if;
end $$;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'students'
      and policyname = 'students_teacher_select'
  ) then
    create policy students_teacher_select
      on students
      for select
      to authenticated
      using (
        exists (
          select 1
            from classes
           where classes.id = students.class_id
             and classes.teacher_id = auth.uid()
        )
      );
  end if;
end $$;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'session_activity_candidates'
      and policyname = 'session_activity_candidates_teacher_select'
  ) then
    create policy session_activity_candidates_teacher_select
      on session_activity_candidates
      for select
      to authenticated
      using (
        exists (
          select 1
            from sessions
            join classes on classes.id = sessions.class_id
           where sessions.id = session_activity_candidates.session_id
             and classes.teacher_id = auth.uid()
        )
      );
  end if;
end $$;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'session_activity_candidates'
      and policyname = 'session_activity_candidates_teacher_write'
  ) then
    create policy session_activity_candidates_teacher_write
      on session_activity_candidates
      for all
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
  end if;
end $$;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'assignments'
      and policyname = 'assignments_read_for_delivery'
  ) then
    create policy assignments_read_for_delivery
      on assignments
      for select
      to anon, authenticated
      using (true);
  end if;
end $$;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'assignments'
      and policyname = 'assignments_teacher_write'
  ) then
    create policy assignments_teacher_write
      on assignments
      for insert
      to authenticated
      with check (
        exists (
          select 1
            from sessions
            join classes on classes.id = sessions.class_id
           where sessions.id = assignments.session_id
             and classes.teacher_id = auth.uid()
        )
      );
  end if;
end $$;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'assignments'
      and policyname = 'assignments_teacher_update'
  ) then
    create policy assignments_teacher_update
      on assignments
      for update
      to authenticated
      using (
        exists (
          select 1
            from sessions
            join classes on classes.id = sessions.class_id
           where sessions.id = assignments.session_id
             and classes.teacher_id = auth.uid()
        )
      )
      with check (
        exists (
          select 1
            from sessions
            join classes on classes.id = sessions.class_id
           where sessions.id = assignments.session_id
             and classes.teacher_id = auth.uid()
        )
      );
  end if;
end $$;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'assignments'
      and policyname = 'assignments_student_complete_update'
  ) then
    create policy assignments_student_complete_update
      on assignments
      for update
      to anon
      using (true)
      with check (true);
  end if;
end $$;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'events'
      and policyname = 'events_insert_for_delivery'
  ) then
    create policy events_insert_for_delivery
      on events
      for insert
      to anon, authenticated
      with check (true);
  end if;
end $$;
