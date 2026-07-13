-- Enable Postgres Changes for teacher live-monitor subscriptions.
-- These subscriptions are in apps/web/src/features/teacher/LiveClassMonitor.tsx.
do $$
begin
  if not exists (
    select 1
      from pg_publication_tables
     where pubname = 'supabase_realtime'
       and schemaname = 'public'
       and tablename = 'segments'
  ) then
    alter publication supabase_realtime add table segments;
  end if;

  if not exists (
    select 1
      from pg_publication_tables
     where pubname = 'supabase_realtime'
       and schemaname = 'public'
       and tablename = 'session_activity_candidates'
  ) then
    alter publication supabase_realtime add table session_activity_candidates;
  end if;
end $$;
