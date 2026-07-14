import { readFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";
import { strict as assert } from "node:assert";

const migration = readFileSync(
  join(__dirname, "../migrations/0011_lesson_state_chunk_ranges.sql"),
  "utf8",
);

test("lesson-state claims skip failed source indexes before claiming", () => {
  assert.match(
    migration,
    /loop[\s\S]*?a\.status = 'failed'[\s\S]*?next_index := next_index \+ 1[\s\S]*?end loop;/,
  );
});

test("silent lesson-state finalization advances the claim without inserting a segment", () => {
  assert.match(migration, /if new_lesson_state is not null then[\s\S]*?insert into segments/);
  assert.match(migration, /delete from lesson_state_claims where id = target_claim_id;/);
});

test("raw transcript claims have no browser table access", () => {
  assert.match(migration, /alter table public\.lesson_state_claims enable row level security;/);
  assert.match(
    migration,
    /revoke all privileges on table public\.lesson_state_claims from public, anon, authenticated;/,
  );
  assert.match(migration, /grant all privileges on table public\.lesson_state_claims to service_role;/);
});

test("manual fallback boundaries are allocated under the session lock", () => {
  assert.match(migration, /create or replace function public\.insert_manual_lesson_state/);
  assert.match(migration, /pg_advisory_xact_lock\(hashtextextended\(target_session_id::text, 47\)\)/);
  assert.match(migration, /coalesce\(min\(from_chunk_index\), 0\) - 1/);
});
