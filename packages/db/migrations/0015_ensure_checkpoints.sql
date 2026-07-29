-- Repair databases whose Drizzle migration ledger contains 0002 even though
-- the checkpoints table is absent. Checkpoint evaluation cannot hand work to
-- artifact generation without this worker-owned state.
create table if not exists public.checkpoints (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references public.sessions(id) on delete cascade,
  ready boolean not null,
  reason text not null,
  summary text not null,
  session_context jsonb not null,
  created_at timestamptz not null default now()
);

create index if not exists checkpoints_session_created_idx
  on public.checkpoints (session_id, created_at desc);
