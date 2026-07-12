create index if not exists sessions_active_started_idx
  on public.sessions (started_at, id) where status = 'active';
create index if not exists checkpoints_session_created_desc_idx
  on public.checkpoints (session_id, created_at desc);
create index if not exists segments_session_created_desc_idx
  on public.segments (session_id, created_at desc);
create index if not exists assignments_session_status_created_idx
  on public.assignments (session_id, status, created_at);
create index if not exists events_assignment_ts_desc_idx
  on public.events (assignment_id, ts desc);

alter table public.sessions add column if not exists correlation_id text;
alter table public.checkpoints add column if not exists correlation_id text;
alter table public.session_activity_candidates add column if not exists correlation_id text;

create or replace function public.get_due_checkpoint_sessions(
  p_interval_minutes integer,
  p_limit integer default 50
)
returns table (session_id uuid)
language sql
stable
security definer
set search_path = public
as $$
  select s.id
  from public.sessions s
  left join lateral (
    select c.created_at
    from public.checkpoints c
    where c.session_id = s.id
    order by c.created_at desc
    limit 1
  ) latest on true
  where s.status = 'active'
    and coalesce(latest.created_at, s.started_at)
      <= now() - make_interval(mins => greatest(p_interval_minutes, 1))
  order by coalesce(latest.created_at, s.started_at), s.id
  limit least(greatest(p_limit, 1), 200)
$$;

revoke all on function public.get_due_checkpoint_sessions(integer, integer) from public, anon, authenticated;
grant execute on function public.get_due_checkpoint_sessions(integer, integer) to service_role;
