alter type activity_source add value if not exists 'adapted';

alter table activities
  add column if not exists activity_set_id text;

create index if not exists activities_activity_set_idx on activities(activity_set_id);

alter table assignments
  drop constraint if exists assignments_score_normalized;

alter table assignments
  add constraint assignments_score_normalized
  check (score is null or (score >= 0 and score <= 1)) not valid;

create or replace function update_activity_outcome_once()
returns trigger
language plpgsql
as $$
declare
  normalized_score real;
begin
  if new.status = 'completed' and old.status is distinct from 'completed' then
    normalized_score := greatest(0, least(1, coalesce(new.score, 0)));
    update activities
      set times_used = times_used + 1,
          avg_score = case
            when avg_score is null then normalized_score
            else ((avg_score * times_used) + normalized_score) / (times_used + 1)
          end,
          updated_at = now()
      where id = new.activity_id;
  end if;
  return new;
end;
$$;

drop trigger if exists assignments_activity_outcome_once on assignments;
create trigger assignments_activity_outcome_once
  after update of status on assignments
  for each row
  execute function update_activity_outcome_once();
