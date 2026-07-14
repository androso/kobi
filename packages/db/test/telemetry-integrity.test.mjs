import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const migrationUrl = new URL("../migrations/0011_telemetry_integrity.sql", import.meta.url);
const sql = await readFile(migrationUrl, "utf8");

test("duplicate and reordered delivery remain idempotent", () => {
  assert.match(sql, /events_assignment_event_id_unique/);
  assert.match(sql, /if exists \([\s\S]*event_id = input_event_id[\s\S]*return;/);
  assert.ok(sql.indexOf("event_id = input_event_id") < sql.indexOf("telemetry rate limit exceeded"));
});

test("burst limits recover and retries do not consume capacity", () => {
  assert.match(sql, /ts >= clock_timestamp\(\) - interval '1 minute'/);
  assert.match(sql, /\) >= 30 then/);
});

test("manifest bounds and authoritative score semantics are enforced", () => {
  assert.match(sql, /jsonb_typeof\(input_payload -> 'item_index'\) is distinct from 'number'/i);
  assert.match(sql, /jsonb_typeof\(input_payload -> 'correct'\) is distinct from 'boolean'/i);
  assert.match(sql, /jsonb_typeof\(input_payload -> 'score'\) is distinct from 'number'/i);
  assert.match(sql, /jsonb_typeof\(input_payload -> 'total'\) is distinct from 'number'/i);
  assert.match(sql, /item_index < 0 or item_index >= item_count/);
  assert.match(sql, /hint_index < 0 or hint_index >= jsonb_array_length/);
  assert.match(sql, /event type is not enabled by the activity manifest/);
  assert.match(sql, /raw_total <> item_count/);
  assert.match(sql, /legacy_total_allowed and raw_total = legacy_answer_total/);
  assert.match(sql, /normalized_score := raw_score \/ raw_total/);
});

test("legacy stored bundles may use answer-key totals during migration", () => {
  assert.match(sql, /join activity_bundles on activity_bundles\.ref = activities\.bundle_ref/);
  assert.match(sql, /activity_bundle_html ~\*.*answer_key.*length/s);
  assert.match(sql, /legacy_answer_total := jsonb_array_length/);
});

test("completion event and assignment update share one database function", () => {
  const insert = sql.indexOf("insert into events");
  const completionUpdate = sql.indexOf("update assignments", insert);
  assert.ok(insert > 0 && completionUpdate > insert);
  assert.doesNotMatch(sql, /exception when others/);
  assert.match(sql, /completed_at = clock_timestamp\(\)/);
});
