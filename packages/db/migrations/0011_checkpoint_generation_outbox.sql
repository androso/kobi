alter table public.checkpoints
  add column if not exists segment_ids jsonb not null default '[]'::jsonb,
  add column if not exists latest_lesson_state jsonb;

create table if not exists public.checkpoint_generation_outbox (
  id uuid primary key default gen_random_uuid(),
  checkpoint_id uuid not null references public.checkpoints(id) on delete cascade,
  status text not null default 'pending' check (status in ('pending','dispatching','delivered','running','completed','failed')),
  attempts integer not null default 0,
  curriculum_matches jsonb,
  queue_job_id text,
  last_error text,
  dispatch_started_at timestamptz,
  delivered_at timestamptz,
  generation_started_at timestamptz,
  generation_completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (checkpoint_id)
);

alter table public.checkpoint_generation_outbox
  add column if not exists dispatch_started_at timestamptz;

create or replace function public.persist_ready_checkpoint_with_outbox(
  p_session_id uuid, p_reason text, p_summary text, p_session_context jsonb,
  p_segment_ids jsonb, p_latest_lesson_state jsonb
) returns uuid language plpgsql security definer set search_path = public as $$
declare v_checkpoint_id uuid;
begin
  insert into checkpoints(session_id, ready, reason, summary, session_context, segment_ids, latest_lesson_state)
  values (p_session_id, true, p_reason, p_summary, p_session_context, p_segment_ids, p_latest_lesson_state)
  returning id into v_checkpoint_id;
  insert into checkpoint_generation_outbox(checkpoint_id) values (v_checkpoint_id);
  return v_checkpoint_id;
end $$;

revoke all on function public.persist_ready_checkpoint_with_outbox(uuid,text,text,jsonb,jsonb,jsonb) from public, anon, authenticated;
grant execute on function public.persist_ready_checkpoint_with_outbox(uuid,text,text,jsonb,jsonb,jsonb) to service_role;
