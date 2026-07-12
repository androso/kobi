import assert from "node:assert/strict";
import process from "node:process";
import postgres, { type TransactionSql } from "postgres";

const databaseUrl = process.env.DATABASE_URL;

if (!databaseUrl) {
  console.log("RLS integration test skipped: DATABASE_URL is not set");
  process.exit(0);
}

const sql = postgres(databaseUrl, { max: 1 });
const teacherA = "10000000-0000-4000-8000-000000000001";
const teacherB = "10000000-0000-4000-8000-000000000002";
const classA = "20000000-0000-4000-8000-000000000001";
const classB = "20000000-0000-4000-8000-000000000002";
const sessionA = "30000000-0000-4000-8000-000000000001";
const sessionB = "30000000-0000-4000-8000-000000000002";

async function asRole<T>(
  tx: TransactionSql,
  role: "anon" | "authenticated" | "service_role",
  userId: string | null,
  run: () => Promise<T>,
) {
  await tx.unsafe(`set local role ${role}`);
  await tx`select set_config('request.jwt.claim.sub', ${userId ?? ""}, true)`;
  await tx`select set_config('request.jwt.claim.role', ${role}, true)`;
  try {
    return await run();
  } finally {
    await tx.unsafe("reset role");
  }
}

async function expectRejected(
  tx: TransactionSql,
  run: (savepoint: TransactionSql) => Promise<unknown>,
  message: string,
) {
  let rejected = false;
  try {
    await tx.savepoint(run);
  } catch {
    rejected = true;
  }
  assert.equal(rejected, true, message);
}

async function main() {
  try {
    await sql.begin(async (tx) => {
    await tx`insert into teacher_profiles (id, display_name) values
      (${teacherA}, 'Teacher A'), (${teacherB}, 'Teacher B')`;
    await tx`insert into classes (id, teacher_id, name, join_code, grade, subject, unit) values
      (${classA}, ${teacherA}, 'Class A', 'RLSA01', 7, 'lenguaje', 'U1'),
      (${classB}, ${teacherB}, 'Class B', 'RLSB02', 7, 'lenguaje', 'U1')`;
    await tx`insert into sessions (id, class_id) values
      (${sessionA}, ${classA}), (${sessionB}, ${classB})`;

    await asRole(tx, "authenticated", teacherA, async () => {
      const profiles = await tx`select id from teacher_profiles order by id`;
      assert.deepEqual(profiles.map((row) => row.id), [teacherA]);

      const classes = await tx`select id from classes order by id`;
      assert.deepEqual(classes.map((row) => row.id), [classA]);

      const sessions = await tx`select id from sessions order by id`;
      assert.deepEqual(sessions.map((row) => row.id), [sessionA]);

      await tx`insert into classes (teacher_id, name, join_code, grade, subject, unit)
        values (${teacherA}, 'Teacher A second class', 'RLSA03', 7, 'lenguaje', 'U1')`;
      await tx`update sessions set status = 'ended', ended_at = now() where id = ${sessionA}`;

      await expectRejected(
        tx,
        (savepoint) => savepoint`insert into classes (teacher_id, name, join_code, grade, subject, unit)
          values (${teacherB}, 'Cross-owned class', 'RLSX04', 7, 'lenguaje', 'U1')`,
        "teacher A must not create a class owned by teacher B",
      );
    });

    await asRole(tx, "authenticated", teacherB, async () => {
      const visible = await tx`select id from sessions where id = ${sessionA}`;
      assert.equal(visible.length, 0, "teacher B must not read teacher A's session");
      const updated = await tx`update sessions set status = 'active' where id = ${sessionA} returning id`;
      assert.equal(updated.length, 0, "teacher B must not update teacher A's session");
    });

    await asRole(tx, "anon", null, async () => {
      await expectRejected(
        tx,
        (savepoint) => savepoint`select id from classes`,
        "anon must not have direct class table access",
      );
      await expectRejected(
        tx,
        (savepoint) => savepoint`select id from assignments`,
        "anon must not have direct assignment table access",
      );
    });

    await asRole(tx, "service_role", null, async () => {
      await tx`insert into audio_chunks
        (session_id, chunk_index, storage_path, start_ms, end_ms)
        values (${sessionA}, 0, 'rls-test/chunk.webm', 0, 1000)`;
      await tx`insert into checkpoints
        (session_id, ready, reason, summary, session_context)
        values (${sessionA}, false, 'test', 'test', '{}'::jsonb)`;
      await tx`insert into curriculum_chunks
        (grade, subject, unit, objective_code, text)
        values (7, 'lenguaje', 'U1', 'RLS.TEST', 'service role write')`;
    });

      throw new Error("ROLLBACK_RLS_TEST");
    });
  } catch (error) {
    if (!(error instanceof Error) || error.message !== "ROLLBACK_RLS_TEST") {
      throw error;
    }
  } finally {
    await sql.end();
  }

  console.log("RLS integration test passed");
}

void main();
