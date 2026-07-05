-- Ensure browser upserts used by the artifact delivery bridge have matching
-- unique/exclusion constraints in Supabase projects that predate the current
-- Drizzle baseline.

do $$
begin
  if not exists (
    select 1
      from pg_constraint
     where conrelid = 'public.activities'::regclass
       and conname = 'activities_bundle_ref_unique'
  ) then
    alter table activities
      add constraint activities_bundle_ref_unique unique (bundle_ref);
  end if;
end $$;

do $$
begin
  if not exists (
    select 1
      from pg_constraint
     where conrelid = 'public.assignments'::regclass
       and conname = 'assignments_session_student_unique'
  ) then
    alter table assignments
      add constraint assignments_session_student_unique unique (session_id, student_id);
  end if;
end $$;
