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
const requiredRlsTables = [
  "teacher_profiles",
  "classes",
  "students",
  "student_profiles",
  "sessions",
  "audio_chunks",
  "segments",
  "checkpoints",
  "session_activity_candidates",
  "activity_bundles",
  "activities",
  "assignments",
  "events",
];

type CapturedQuery = {
  text: string;
  values: unknown[];
};

type FakeSqlOptions = {
  missingAudioCount?: number;
  publicAudioBucketCount?: number;
  queueTable?: string | null;
  scheduleTable?: string | null;
  scheduleRows?: Array<{ name: string; cron: string }>;
  completionEventAssignmentMismatchCount?: number;
  unverifiedActivityCount?: number;
  invalidRlsTables?: string[];
  teacherIdentity?: { teacher_id: string; auth_user_exists: boolean; teacher_profile_exists: boolean };
};

function createFakeSql({
  missingAudioCount = 0,
  publicAudioBucketCount = 0,
  queueTable = "pgboss.queue",
  scheduleTable = "pgboss.schedule",
  scheduleRows = [{ name: "checkpoint-scheduler", cron: "* * * * *" }],
  completionEventAssignmentMismatchCount = 0,
  unverifiedActivityCount = 0,
  invalidRlsTables = [],
  teacherIdentity = { teacher_id: "teacher-1", auth_user_exists: true, teacher_profile_exists: true },
}: FakeSqlOptions = {}) {
  const calls: CapturedQuery[] = [];
  const sql = Object.assign(
    ((strings: TemplateStringsArray, ...values: unknown[]) => {
      const text = strings.join("?");
      calls.push({ text, values });

      if (text.includes("auth.users")) return Promise.resolve([teacherIdentity]);
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
      if (text.includes("b.public is distinct from false")) return Promise.resolve([{ count: publicAudioBucketCount }]);
      if (text.includes("from events e") && text.includes("join assignments a")) {
        return Promise.resolve([{ count: completionEventAssignmentMismatchCount }]);
      }
      if (text.includes("left join activities act")) return Promise.resolve([{ count: unverifiedActivityCount }]);
      if (text.includes("from pg_class")) {
        return Promise.resolve(requiredRlsTables.map((tablename) => ({
          tablename,
          rowsecurity: !invalidRlsTables.includes(tablename),
          policy_count: invalidRlsTables.includes(tablename) ? 0 : 1,
        })));
      }
      if (text.includes("from pg_namespace")) return Promise.resolve([{ schema_name: "pgboss" }]);
      if (text.includes("to_regclass('pgboss.schedule')")) return Promise.resolve([{ relation_name: scheduleTable }]);
      if (text.includes("to_regclass")) return Promise.resolve([{ relation_name: queueTable }]);
      if (text.includes("from pgboss.queue")) return Promise.resolve(requiredQueues.map((name) => ({ name })));
      if (text.includes("from pgboss.schedule")) return Promise.resolve(scheduleRows);
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
    { kind: "postgres-array", values: requiredRlsTables, type: 25 },
    { kind: "postgres-array", values: requiredQueues, type: 25 },
  ]);
});

test("rejects public audio, bad scheduler cron, and complete events on incomplete assignments", async () => {
  const { sql } = createFakeSql({
    publicAudioBucketCount: 1,
    scheduleRows: [{ name: "checkpoint-scheduler", cron: "*/5 * * * *" }],
    completionEventAssignmentMismatchCount: 1,
  });
  const evidence = await runRecoveryAudit(sql, config);

  assert.equal(evidence.passed, false);
  assert.equal(evidence.checks.find((check) => check.name === "private_audio_bucket")?.details.count, 1);
  assert.deepEqual(evidence.checks.find((check) => check.name === "checkpoint_scheduler_schedule")?.details.actual, {
    name: "checkpoint-scheduler",
    cron: "*/5 * * * *",
  });
  assert.equal(evidence.checks.find((check) => check.name === "completion_event_assignment_consistency")?.details.count, 1);
});

test("rejects missing teacher identity, unverified assignments, and RLS gaps in sensitive tables", async () => {
  const { sql } = createFakeSql({
    teacherIdentity: { teacher_id: "teacher-1", auth_user_exists: false, teacher_profile_exists: true },
    unverifiedActivityCount: 1,
    invalidRlsTables: ["teacher_profiles", "audio_chunks", "segments", "checkpoints"],
  });
  const evidence = await runRecoveryAudit(sql, config);

  assert.equal(evidence.passed, false);
  assert.equal(evidence.checks.find((check) => check.name === "teacher_identity_consistency")?.ok, false);
  assert.equal(evidence.checks.find((check) => check.name === "assigned_activity_verification")?.details.count, 1);
  assert.deepEqual(evidence.checks.find((check) => check.name === "rls_and_policies")?.details.invalid_tables, [
    "teacher_profiles",
    "audio_chunks",
    "segments",
    "checkpoints",
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
