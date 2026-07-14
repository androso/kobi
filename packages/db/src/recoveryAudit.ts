import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import postgres from "postgres";
import { loadRootEnv } from "./loadEnv.js";

type Check = {
  name: string;
  ok: boolean;
  details: Record<string, unknown>;
};

type CountRow = { count: number };

export type RecoverySql = ReturnType<typeof postgres>;
type SqlQuery = ReturnType<RecoverySql>;

export type RecoveryAuditConfig = {
  environment: string;
  sessionId: string;
  commitSha: string | null;
};

export type RecoveryEvidence = {
  schema_version: "kobi-recovery-evidence/v1";
  generated_at: string;
  environment: string;
  representative_session_id: string;
  commit_sha: string | null;
  passed: boolean;
  checks: Check[];
};

async function count(query: SqlQuery): Promise<number> {
  const rows = (await query) as unknown as CountRow[];
  return Number(rows[0]?.count ?? 0);
}

function record(checks: Check[], name: string, value: number, details: Record<string, unknown> = {}) {
  checks.push({ name, ok: value === 0, details: { count: value, ...details } });
}

export async function runRecoveryAudit(sql: RecoverySql, { environment, sessionId, commitSha }: RecoveryAuditConfig): Promise<RecoveryEvidence> {
  const checks: Check[] = [];
  const [session] = await sql<{
    session_id: string;
    status: string;
    ended_at: string | null;
    class_id: string;
    teacher_id: string;
    assignment_count: number;
    completed_count: number;
    complete_event_count: number;
  }[]>`
    select s.id as session_id, s.status, s.ended_at, c.id as class_id, c.teacher_id,
      count(distinct a.id)::int as assignment_count,
      count(distinct a.id) filter (where a.status = 'completed')::int as completed_count,
      count(distinct e.id) filter (where e.type = 'complete')::int as complete_event_count
    from sessions s
    join classes c on c.id = s.class_id
    left join assignments a on a.session_id = s.id
    left join events e on e.assignment_id = a.id
    where s.id = ${sessionId}
    group by s.id, s.status, s.ended_at, c.id, c.teacher_id
  `;
  checks.push({
    name: "representative_completed_session",
    ok: Boolean(session && session.status === "ended" && session.ended_at && session.assignment_count > 0 && session.completed_count > 0 && session.complete_event_count > 0),
    details: session ?? { session_id: sessionId, missing: true },
  });

  record(checks, "assignment_ownership", await count(sql`
    select count(*)::int as count from assignments a
    join sessions s on s.id = a.session_id
    join students st on st.id = a.student_id
    where a.session_id = ${sessionId} and st.class_id <> s.class_id
  `));
  record(checks, "assignment_candidate_consistency", await count(sql`
    select count(*)::int as count from assignments a
    left join session_activity_candidates c on c.id = a.candidate_id
    where a.session_id = ${sessionId} and (
      c.id is null or c.session_id <> a.session_id or c.activity_id <> a.activity_id
      or c.difficulty_band <> a.variant or c.status <> 'approved'
    )
  `));
  record(checks, "completion_event_consistency", await count(sql`
    select count(*)::int as count from assignments a
    where a.session_id = ${sessionId} and a.status = 'completed'
      and not exists (select 1 from events e where e.assignment_id = a.id and e.type = 'complete')
  `));
  record(checks, "missing_audio_objects", await count(sql`
    select count(*)::int as count from audio_chunks ac
    where ac.session_id = ${sessionId} and not exists (
      select 1 from storage.objects o where o.bucket_id = 'audio-chunks' and o.name = ac.storage_path
    )
  `));
  record(checks, "orphaned_audio_objects", await count(sql`
    select count(*)::int as count from storage.objects o
    where o.bucket_id = 'audio-chunks' and not exists (
      select 1 from audio_chunks ac where ac.storage_path = o.name
    )
  `));
  record(checks, "missing_activity_bundles", await count(sql`
    select count(*)::int as count from activities a
    left join activity_bundles b on b.ref = a.bundle_ref
    where b.ref is null
  `));
  record(checks, "required_buckets", await count(sql`
    select count(*)::int as count from (values ('audio-chunks')) required(id)
    where not exists (select 1 from storage.buckets b where b.id = required.id)
  `));

  const requiredRlsTables = ["students", "sessions", "session_activity_candidates", "activity_bundles", "activities", "assignments", "events"];
  const rlsRows = await sql<{ tablename: string; rowsecurity: boolean; policy_count: number }[]>`
    select c.relname as tablename, c.relrowsecurity as rowsecurity, count(p.policyname)::int as policy_count
    from pg_class c join pg_namespace n on n.oid = c.relnamespace
    left join pg_policies p on p.schemaname = n.nspname and p.tablename = c.relname
    where n.nspname = 'public' and c.relname = any(${requiredRlsTables})
    group by c.relname, c.relrowsecurity
  `;
  const invalidRls = requiredRlsTables.filter((table) => {
    const row = rlsRows.find((candidate) => candidate.tablename === table);
    return !row?.rowsecurity || row.policy_count === 0;
  });
  checks.push({ name: "rls_and_policies", ok: invalidRls.length === 0, details: { invalid_tables: invalidRls, tables: rlsRows } });

  const queueSchemas = await sql<{ schema_name: string }[]>`
    select nspname as schema_name from pg_namespace where nspname in ('pgboss', 'pgboss_archive') order by nspname
  `;
  checks.push({ name: "queue_schema", ok: queueSchemas.some((row) => row.schema_name === "pgboss"), details: { schemas: queueSchemas } });
  const requiredQueues = ["transcribe-chunk", "build-lesson-state", "generate-activity-artifacts", "checkpoint-scheduler", "evaluate-checkpoint"];
  const [queueTable] = await sql<{ relation_name: string | null }[]>`
    select to_regclass('pgboss.queue')::text as relation_name
  `;
  if (!queueTable?.relation_name) {
    checks.push({
      name: "queue_registrations",
      ok: false,
      details: { missing_table: "pgboss.queue", missing_queues: requiredQueues, queues: [] },
    });
  } else {
    const queueRows = await sql<{ name: string }[]>`
      select name from pgboss.queue where name = any(${requiredQueues}) order by name
    `;
    const missingQueues = requiredQueues.filter((name) => !queueRows.some((row) => row.name === name));
    checks.push({ name: "queue_registrations", ok: missingQueues.length === 0, details: { missing_queues: missingQueues, queues: queueRows } });
  }

  const evidence: RecoveryEvidence = {
    schema_version: "kobi-recovery-evidence/v1",
    generated_at: new Date().toISOString(),
    environment,
    representative_session_id: sessionId,
    commit_sha: commitSha,
    passed: checks.every((check) => check.ok),
    checks,
  };
  return evidence;
}

export async function main() {
  loadRootEnv();
  const connectionString = process.env.RECOVERY_DATABASE_URL;
  const environment = process.env.RECOVERY_ENVIRONMENT;
  const sessionId = process.env.RECOVERY_SESSION_ID;
  const evidencePath = process.env.RECOVERY_EVIDENCE_PATH ?? "artifacts/recovery/restore-audit.json";

  if (!connectionString) throw new Error("RECOVERY_DATABASE_URL is required; DATABASE_URL is intentionally ignored");
  if (!environment || !/^(restore|recovery|dr)-/i.test(environment)) {
    throw new Error("RECOVERY_ENVIRONMENT must name an isolated environment and start with restore-, recovery-, or dr-");
  }
  if (!sessionId) throw new Error("RECOVERY_SESSION_ID is required for the representative completed-session audit");

  const sql = postgres(connectionString, { max: 1, prepare: false });
  try {
    const evidence = await runRecoveryAudit(sql, {
      environment,
      sessionId,
      commitSha: process.env.GITHUB_SHA ?? null,
    });
    const output = path.resolve(evidencePath);
    mkdirSync(path.dirname(output), { recursive: true });
    writeFileSync(output, `${JSON.stringify(evidence, null, 2)}\n`, { mode: 0o600 });
    console.log(JSON.stringify(evidence, null, 2));
    if (!evidence.passed) process.exitCode = 1;
  } finally {
    await sql.end();
  }
}
