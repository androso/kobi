-- Allow students to hide a delivered activity without deleting assignment or
-- telemetry history.

do $$
begin
  if not exists (
    select 1
      from information_schema.columns
     where table_schema = 'public'
       and table_name = 'assignments'
       and column_name = 'dismissed_at'
  ) then
    alter table assignments
      add column dismissed_at timestamptz;
  end if;
end $$;
