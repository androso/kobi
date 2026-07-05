-- Accept the web app's generated classroom join codes:
-- five uppercase alphanumeric characters, e.g. KOBI7.
-- Existing classrooms may already have six-character codes from the previous
-- live constraint, so allow both lengths without breaking those joins.

alter table classes
  drop constraint if exists classes_join_code_format;

alter table classes
  add constraint classes_join_code_format
  check (join_code = upper(join_code) and join_code ~ '^[A-Z0-9]{5,6}$');
