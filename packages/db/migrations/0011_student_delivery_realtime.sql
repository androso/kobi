-- Auth-lite students cannot safely subscribe to assignments/events through
-- Postgres Changes because Realtime cannot pass their delivery RPC token into
-- RLS. Emit an empty change signal on an unguessable per-student topic instead;
-- clients still reconcile all data through the token-checked delivery RPCs.

create or replace function broadcast_student_delivery_change()
returns trigger
language plpgsql
security definer
set search_path = public, realtime
as $$
declare
  target_student_id uuid;
  target_access_token text;
begin
  if tg_table_name = 'assignments' then
    target_student_id := coalesce(new.student_id, old.student_id);
  else
    select assignments.student_id
      into target_student_id
      from assignments
     where assignments.id = coalesce(new.assignment_id, old.assignment_id);
  end if;

  select students.access_token
    into target_access_token
    from students
   where students.id = target_student_id;

  if target_access_token is not null then
    perform realtime.send(
      '{}'::jsonb,
      'delivery_changed',
      'student-delivery:' || target_access_token,
      false
    );
  end if;

  return coalesce(new, old);
end;
$$;

revoke all on function broadcast_student_delivery_change() from public;

drop trigger if exists assignments_broadcast_delivery_change on assignments;
create trigger assignments_broadcast_delivery_change
after insert or update or delete on assignments
for each row execute function broadcast_student_delivery_change();

drop trigger if exists events_broadcast_delivery_change on events;
create trigger events_broadcast_delivery_change
after insert or update or delete on events
for each row execute function broadcast_student_delivery_change();
