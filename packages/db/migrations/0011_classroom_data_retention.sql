create table if not exists public.retention_deletion_attempts (
  id uuid primary key default gen_random_uuid(),
  session_id uuid references public.sessions(id) on delete set null,
  reason text not null check (reason in ('scheduled', 'manual')),
  status text not null check (status in ('running', 'completed', 'failed')),
  error_category text,
  result jsonb,
  created_at timestamptz not null default now(),
  completed_at timestamptz
);

create index if not exists retention_deletion_attempts_failed_idx
  on public.retention_deletion_attempts (created_at desc)
  where status = 'failed';

alter table public.retention_deletion_attempts enable row level security;
revoke all on public.retention_deletion_attempts from anon, authenticated;
grant all on public.retention_deletion_attempts to service_role;
