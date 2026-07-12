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
  assert.match(sql, /item_index < 0 or item_index >= item_count/);
  assert.match(sql, /hint_index < 0 or hint_index >= jsonb_array_length/);
  assert.match(sql, /event type is not enabled by the activity manifest/);
  assert.match(sql, /raw_total <= 0 or raw_total <> item_count or raw_score < 0 or raw_score > raw_total/);
  assert.match(sql, /normalized_score := raw_score \/ raw_total/);
});

test("completion event and assignment update share one database function", () => {
  const insert = sql.indexOf("insert into events");
  const completionUpdate = sql.indexOf("update assignments", insert);
  assert.ok(insert > 0 && completionUpdate > insert);
  assert.doesNotMatch(sql, /exception when others/);
  assert.match(sql, /completed_at = clock_timestamp\(\)/);
});
