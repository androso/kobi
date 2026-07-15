alter type activity_source add value if not exists 'adapted';

alter table activities
  add column if not exists activity_set_id text;

create index if not exists activities_activity_set_idx on activities(activity_set_id);

create or replace function match_activity_sets(
  query_embedding vector(768),
  match_count int default 10,
  filter_grade int default null,
  filter_subject text default null,
  filter_unit text default null
)
returns table (
  activity_set_id text,
  best_similarity real,
  activity_count bigint
)
language sql
stable
as $$
  select
    activities.activity_set_id,
    max(1 - (activities.embedding <=> query_embedding))::real as best_similarity,
    count(*) as activity_count
  from activities
  where activities.status = 'verified'
    and activities.activity_set_id is not null
    and activities.embedding is not null
    and (filter_grade is null or (activities.manifest->'curriculum'->>'grade')::int = filter_grade)
    and (filter_subject is null or activities.manifest->'curriculum'->>'subject' = filter_subject)
    and (filter_unit is null or activities.manifest->'curriculum'->>'unit' = filter_unit)
  group by activities.activity_set_id
  order by best_similarity desc
  limit match_count;
$$;

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
