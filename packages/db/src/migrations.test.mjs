import { readFileSync } from "node:fs";
import { test } from "node:test";
import assert from "node:assert/strict";

const migration = readFileSync(new URL("../migrations/0011_session_reports.sql", import.meta.url), "utf8");
const normalized = migration.replace(/\s+/g, " ").toLowerCase();

test("repository stats normalize multi-item completion scores", () => {
  assert.match(normalized, /avg\(normalized_score\) filter \(where status = 'completed'\)/);
  assert.match(normalized, /jsonb_typeof\(e\.payload->'total'\) = 'number'.*\(e\.payload->>'total'\)::real/);
});

test("session close uses the database clock and reports only ended sessions", () => {
  assert.match(normalized, /set status = 'ended', ended_at = now\(\)/);
  assert.match(normalized, /and s\.status = 'ended' and s\.ended_at is not null/);
});

test("report telemetry casts are guarded by JSON types", () => {
  assert.match(normalized, /jsonb_typeof\(e\.payload->'correct'\) = 'boolean'.*\(e\.payload->>'correct'\)::boolean = false/);
  assert.match(normalized, /jsonb_typeof\(e\.payload->'item_index'\) = 'number'.*\(e\.payload->>'item_index'\)::integer/);
  assert.doesNotMatch(normalized, /coalesce\(\(e\.payload->>'correct'\)::boolean/);
});
