-- Auth-lite student join path. Students do not have Supabase Auth rows, so
-- they need a narrow RPC that resolves a join code and creates a student row
-- without granting anonymous table-wide class reads.

create or replace function join_class_by_code(
  input_code text,
  input_display_name text
)
returns table (
  student_id uuid,
  class_id uuid,
  class_name text,
  join_code text,
  display_name text
)
language plpgsql
security definer
set search_path = public
as $$
declare
  matched_class classes%rowtype;
  created_student students%rowtype;
  normalized_code text := upper(trim(input_code));
  normalized_name text := trim(input_display_name);
begin
  if normalized_code = '' or normalized_name = '' then
    raise exception 'Class code and display name are required'
      using errcode = '22023';
  end if;

  select *
    into matched_class
    from classes
   where classes.join_code = normalized_code
   limit 1;

  if not found then
    raise exception 'Class not found'
      using errcode = 'P0002';
  end if;

  insert into students (class_id, display_name)
  values (matched_class.id, normalized_name)
  returning * into created_student;

  student_id := created_student.id;
  class_id := matched_class.id;
  class_name := matched_class.name;
  join_code := matched_class.join_code;
  display_name := created_student.display_name;
  return next;
end;
$$;

grant execute on function join_class_by_code(text, text) to anon, authenticated;
