alter table public.sessions
  add column if not exists classroom_data_deletion_requested_at timestamptz;

create index if not exists sessions_classroom_data_deletion_requested_idx
  on public.sessions (classroom_data_deletion_requested_at)
  where classroom_data_deletion_requested_at is not null;
