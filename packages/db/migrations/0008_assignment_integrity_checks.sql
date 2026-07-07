-- Enforce assignment delivery invariants that span candidates, sessions, and students.

do $$
begin
  if exists (
    select 1
      from assignments
     where candidate_id is null
  ) then
    raise exception 'Cannot enforce assignments.candidate_id NOT NULL while null assignment rows exist';
  end if;
end $$;

alter table assignments
  alter column candidate_id set not null;

alter table assignments
  drop constraint if exists assignments_candidate_id_session_activity_candidates_id_fk;

alter table assignments
  add constraint assignments_candidate_id_session_activity_candidates_id_fk
  foreign key (candidate_id)
  references session_activity_candidates(id)
  on delete restrict;

create or replace function validate_assignment_integrity()
returns trigger
language plpgsql
as $$
declare
  candidate record;
  session_class_id uuid;
  student_class_id uuid;
begin
  select
    session_id,
    activity_id,
    difficulty_band,
    status
    into candidate
    from session_activity_candidates
   where id = new.candidate_id;

  if not found then
    raise foreign_key_violation using message = 'Assignment candidate_id must reference an existing session_activity_candidates row';
  end if;

  if candidate.session_id <> new.session_id then
    raise check_violation using message = 'Assignment session_id must match candidate session_id';
  end if;

  if candidate.activity_id <> new.activity_id then
    raise check_violation using message = 'Assignment activity_id must match candidate activity_id';
  end if;

  if candidate.difficulty_band <> new.variant then
    raise check_violation using message = 'Assignment variant must match candidate difficulty_band';
  end if;

  if candidate.status <> 'approved' then
    raise check_violation using message = 'Assignment candidate must be approved before delivery';
  end if;

  select class_id
    into session_class_id
    from sessions
   where id = new.session_id;

  if not found then
    raise foreign_key_violation using message = 'Assignment session_id must reference an existing sessions row';
  end if;

  select class_id
    into student_class_id
    from students
   where id = new.student_id;

  if not found then
    raise foreign_key_violation using message = 'Assignment student_id must reference an existing students row';
  end if;

  if session_class_id <> student_class_id then
    raise check_violation using message = 'Assignment student must belong to the session class';
  end if;

  return new;
end;
$$;

drop trigger if exists assignments_validate_integrity on assignments;

create trigger assignments_validate_integrity
  before insert or update of session_id, candidate_id, activity_id, student_id, variant
  on assignments
  for each row
  execute function validate_assignment_integrity();
