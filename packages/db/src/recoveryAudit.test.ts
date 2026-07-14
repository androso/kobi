import assert from "node:assert/strict";
import test from "node:test";
import { runRecoveryAudit, type RecoverySql } from "./recoveryAudit.js";

const requiredQueues = [
  "transcribe-chunk",
  "build-lesson-state",
  "generate-activity-artifacts",
  "checkpoint-scheduler",
  "evaluate-checkpoint",
];

type CapturedQuery = {
  text: string;
  values: unknown[];
};

type FakeSqlOptions = {
  missingAudioCount?: number;
  queueTable?: string | null;
};

function createFakeSql({ missingAudioCount = 0, queueTable = "pgboss.queue" }: FakeSqlOptions = {}) {
  const calls: CapturedQuery[] = [];
  const sql = Object.assign(
    ((strings: TemplateStringsArray, ...values: unknown[]) => {
      const text = strings.join("?");
      calls.push({ text, values });

      if (text.includes("from sessions s")) {
        return Promise.resolve([
          {
            session_id: "session-1",
            status: "ended",
            ended_at: "2026-07-12T12:00:00Z",
            class_id: "class-1",
            teacher_id: "teacher-1",
            assignment_count: 1,
            completed_count: 1,
            complete_event_count: 1,
          },
        ]);
      }
      if (text.includes("select count(*)::int as count from audio_chunks ac")) return Promise.resolve([{ count: missingAudioCount }]);
      if (text.includes("from pg_class")) {
        return Promise.resolve([
          "students",
          "sessions",
          "session_activity_candidates",
          "activity_bundles",
          "activities",
          "assignments",
          "events",
        ].map((tablename) => ({ tablename, rowsecurity: true, policy_count: 1 })));
      }
      if (text.includes("from pg_namespace")) return Promise.resolve([{ schema_name: "pgboss" }]);
      if (text.includes("to_regclass")) return Promise.resolve([{ relation_name: queueTable }]);
      if (text.includes("from pgboss.queue")) return Promise.resolve(requiredQueues.map((name) => ({ name })));
      return Promise.resolve([{ count: 0 }]);
    }) as (...args: unknown[]) => Promise<unknown>,
    {
      array: (values: unknown[], type: number) => ({ kind: "postgres-array", values, type }),
      end: async () => undefined,
    },
  ) as unknown as RecoverySql;

  return { calls, sql };
}

const config = {
  environment: "restore-test",
  sessionId: "session-1",
  commitSha: "commit-1",
};

test("audits missing audio objects across the restored backup", async () => {
  const { calls, sql } = createFakeSql({ missingAudioCount: 2 });
  const evidence = await runRecoveryAudit(sql, config);

  assert.equal(evidence.passed, false);
  assert.equal(evidence.checks.find((check) => check.name === "missing_audio_objects")?.details.count, 2);

  const audioQuery = calls.find((call) => call.text.includes("select count(*)::int as count from audio_chunks ac"));
  assert.ok(audioQuery);
  assert.doesNotMatch(audioQuery.text, /where ac\.session_id/);

  const arrayBindings = calls.flatMap((call) => call.values.filter((value) => {
    return typeof value === "object" && value !== null && "kind" in value;
  }));
  assert.deepEqual(arrayBindings, [
    { kind: "postgres-array", values: ["students", "sessions", "session_activity_candidates", "activity_bundles", "activities", "assignments", "events"], type: 25 },
    { kind: "postgres-array", values: requiredQueues, type: 25 },
  ]);
});

test("records a missing pg-boss table without skipping the evidence result", async () => {
  const { calls, sql } = createFakeSql({ queueTable: null });
  const evidence = await runRecoveryAudit(sql, config);
  const queueCheck = evidence.checks.find((check) => check.name === "queue_registrations");

  assert.equal(evidence.passed, false);
  assert.deepEqual(queueCheck, {
    name: "queue_registrations",
    ok: false,
    details: { missing_table: "pgboss.queue", missing_queues: requiredQueues, queues: [] },
  });
  assert.equal(calls.some((call) => call.text.includes("from pgboss.queue")), false);
});
