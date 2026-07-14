# Data lifecycle and disaster recovery

This policy covers Kobi v0's production data in Supabase. Platform Area F owns the recovery process; the owning product area validates its recovered data. Production is never a restore target: every exercise restores into a separate Supabase project whose name starts with `restore-`, `recovery-`, or `dr-`.

## Objectives and lifecycle

| Data class | Owner | Sensitivity | Retention | RPO | RTO | Recovery method |
|---|---|---|---|---|---|---|
| Auth users, teacher profiles, classes, students, student profiles | F | High: identity and student data | Account/class lifetime plus 30 days after an approved deletion request | 24 hours | 8 hours | Restore Auth and Postgres to the same recovery point; preserve UUIDs exactly |
| Active sessions, segments, checkpoints | A/F | High: classroom-derived content | Session rows: class lifetime; segments/checkpoints: 30 days after session end | 15 minutes | 2 hours | Supabase PITR/database restore; never reconstruct an active lesson from model output |
| Audio objects and `audio_chunks` metadata | A/F | Highest: classroom audio | Delete 7 days after successful transcription or 30 days after capture, whichever is earlier; legal hold overrides deletion | 24 hours | 8 hours | Restore the database snapshot and the `audio-chunks` bucket from the matching backup window; reconcile by `storage_path` |
| Candidates, assignments, events, and completed-session reports derived from them | C/D/E/F | High: student performance | Class lifetime plus 30 days after approved deletion | 15 minutes | 2 hours | Restore exactly as one referentially consistent database point; reports are recomputed only from restored assignments/events |
| Activity manifests and `activity_bundles` | C/F | Medium; may contain curriculum content | Verified/reused: product lifetime; rejected/superseded: 30 days unless referenced | 24 hours | 8 hours | Restore referenced artifacts exactly. Unreferenced corrupted generated artifacts may be regenerated and must pass verification before use |
| Curriculum chunks and embeddings | B | Low/medium: licensed curriculum | Source-license lifetime; replace atomically on a new ingestion version | 7 days | 24 hours | Re-ingest from the versioned canonical curriculum source; embeddings are rebuildable and are not authoritative |
| pg-boss operational metadata | F | Operational | Active jobs until completion; archive records 30 days | 15 minutes | 2 hours | Restore with Postgres, then register the worker's current job handlers/schedules before resuming. Do not replay completed generation jobs blindly |
| Restore evidence | F | Operational, may contain stable IDs but no content or secrets | 1 year | 7 days | 24 hours | GitHub Actions artifact plus operator incident record |

Supabase production must have daily backups and point-in-time recovery configured to meet the 15-minute RPO. Area F owns that setting, the recovery project, the service-role/database secrets, and the quarterly exercise. The `audio-chunks` bucket must be private, versioned or independently backed up daily, and configured with the audio retention rule above. Backup copies must use provider-managed encryption and access limited to Area F operators. A quarterly restore exercise is the minimum; run one before a material schema/storage migration and after changing the backup provider or region.

The repository and CI contain no recovery credentials. GitHub environment `disaster-recovery` owns `RECOVERY_DATABASE_URL`, pointing only to the isolated restored project, and repository variable `RECOVERY_SESSION_ID`, naming a representative completed session. Operators obtain production backup access through the team's managed Supabase organization account and password manager; developer `.env` files are never part of recovery.

## Recovery order and consistency

1. Freeze application writes and record the incident time. Choose one recovery point that predates the fault and satisfies the declared RPO; database and object backups must cover that same point.
2. Restore Auth/Postgres and Storage into the isolated project. Apply no forward migrations until the restored schema version and migration history are recorded.
3. Deploy the matching application commit, inject recovery-project secrets through the managed environment, register pg-boss handlers/schedules, and keep web/worker traffic disabled.
4. Run `RECOVERY_ENVIRONMENT=restore-YYYY-MM-DD RECOVERY_DATABASE_URL=... RECOVERY_SESSION_ID=... pnpm --filter @kobi/db recovery:audit`. The command intentionally ignores `DATABASE_URL`, refuses an environment without a recovery prefix, writes `artifacts/recovery/restore-audit.json`, and fails on ownership, assignment/report consistency, verified-activity, teacher identity, RLS, private-bucket, scheduler-registration, queue, or object reconciliation gaps.
5. Reconcile missing objects from the matching object backup. Quarantine orphaned objects before deletion; link them only when an authoritative database row proves ownership. Re-run the audit until it passes, then have Areas A/C/D/E validate the representative session in the application.
6. Promote by switching application configuration to the validated recovery project, never by restoring over production. Rotate exposed credentials, resume workers before web writes, and retain the old project read-only until sign-off.

## Scenario runbooks

**Accidental deletion.** Stop writes, select the PITR point immediately before deletion, and follow the recovery order. Restore the whole consistency boundary rather than inserting individual assignment/event rows, because their candidate, activity, student, and class relationships are the report's source of truth.

**Bad migration.** Stop deploys and writes, preserve logs and the migration identifier, then restore to the pre-migration point in isolation. Fix the migration in source, apply it to the restored copy, run `db:migrate` and the recovery audit, and only then promote. Never edit the migration journal or production schema manually to make versions appear aligned.

**Regional or provider outage.** Declare the selected recovery point, restore database/Auth and object backup into the approved alternate Supabase project/region, configure the matching web and worker commit, verify secrets, RLS, buckets, lifecycle rules, and queues, then audit before DNS/environment cutover. If the latest object copy trails Postgres, the missing-object check defines the affected audio set and traffic stays disabled until it is restored or explicitly accepted as data loss.

**Corrupted generated artifact.** Disable the affected candidate/activity from delivery and identify assignments referencing it. Restore referenced `activity_bundles` and activity rows exactly from backup. Only an unreferenced artifact may be regenerated from its stored context/evidence; it receives a new unguessable `bundle_ref`, passes the normal verifier, and is never substituted silently into a completed assignment.

## Exercise evidence and sign-off

Each exercise records the backup timestamp, restore start/end, source and target project identifiers, application commit, representative session ID, achieved RPO/RTO, audit JSON, manual UI validation, lifecycle configuration screenshots/exports, operator, reviewer, and unresolved gaps with owners/dates. The scheduled workflow uploads the machine-readable audit for 90 days; Area F copies the final evidence link into the incident/change record and keeps that record for one year.

A restore passes only when the audit reconstructs an ended session with assignments and completion telemetry, teacher/class ownership is intact, the representative teacher exists in both Auth and `teacher_profiles`, candidate/activity/band relationships agree, assigned activities are verified, completion events agree with assignment status in both directions, required RLS policies and tables exist, the `audio-chunks` bucket is private, the checkpoint scheduler row has its expected cron, pg-boss is installed, and no missing or orphaned audio objects remain. Any accepted gap is a failed exercise until it has an owner and remediation date; production cutover additionally requires zero unresolved data-integrity failures.
