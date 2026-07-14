# Database deployment safety

Kobi deploys database changes before application code, and every release must remain compatible with both the old and new application versions during a rolling rollout. The migration command is `KOBI_RELEASE_ID=<commit-or-release> pnpm --filter @kobi/db db:migrate`; it serializes migrators and records raw SQL files in `public.kobi_raw_migrations`.

## Release order

1. **Back up and expand the schema.** Confirm the latest Supabase backup or point-in-time recovery window, then apply additive tables, nullable columns, indexes, functions, and policies that work with the currently deployed code. Destructive renames, type replacements, and constraint tightening do not belong in this step.
2. **Roll out compatible code.** Deploy code that can operate against the expanded schema and, when data is moving, can read the old representation while writing both representations. Keep the previous release available until health checks pass.
3. **Backfill in bounded batches.** Run an observable, restartable backfill outside the migration transaction when the data volume could hold locks or exceed the deployment window. Record progress and make reruns idempotent.
4. **Validate the transition.** Compare row counts and invariants, exercise the affected RLS/RPC paths as `anon`, `authenticated`, and `service_role`, and confirm the old and new application versions can still serve traffic.
5. **Contract later.** Remove old columns, functions, policies, or compatibility writes only in a later release after the compatibility window has elapsed and no deployed code or rollback target uses them.

Destructive changes require explicit expand, migrate, and contract migrations across separate releases. A single migration that removes or renames a live contract is rejected because rolling instances and rollback code could still depend on it.

## Recovery and rollback

Before a production migration, verify that a restorable backup exists and record the recovery point with the release. Test restore procedures periodically in a non-production Supabase project; a backup that has never been restored is not a verified recovery path.

If a migration fails, its raw SQL transaction rolls back and its history row is not written, so fix the cause and rerun the same release. The runner validates raw checksums, missing files, and filename ordering before Drizzle runs, which prevents a bad raw history from leaving generated migrations partially applied. If the schema succeeded but the new application fails, roll application code back only when the old version is compatible with the expanded schema. Never edit, delete, or rename an applied migration file. Prefer a new forward-fix migration with a higher filename for schema mistakes; restore from backup only when a forward fix cannot preserve data or the migration caused unrecoverable corruption, and stop writes before restoring.

The first release that enables raw tracking must target a database whose legacy raw migrations have already been applied. When the tracker table is absent but `drizzle.__drizzle_migrations` already contains history, the runner records the current raw files as a zero-duration baseline after Drizzle succeeds; clean installs have no pre-existing Drizzle history, so they execute the raw files. The tracker table is revoked from `anon`, `authenticated`, and `public` so browser clients cannot change deployment history.

## Clean-install and upgrade validation

Before merging a schema release, validate both paths against disposable Supabase databases:

1. Create a clean database, run `pnpm --filter @kobi/db db:migrate` twice, and confirm the second run adds no `kobi_raw_migrations` rows and leaves the schema unchanged.
2. Restore the oldest supported production snapshot into a second database, run the same command, and compare its schema to the clean database with `pg_dump --schema-only --no-owner --no-privileges` after removing environment-specific comments.
3. Confirm every file under `packages/db/migrations` has one matching history row, then change a copied applied SQL file and verify the runner exits with the checksum-mismatch error without applying later files.
4. Start two migration commands concurrently against a disposable database and confirm one waits on `kobi_database_migrations`; both must finish with one history row per raw file.

The supported upgrade snapshot is the current production backup taken before the release. Older unmaintained snapshots must be upgraded through a documented intermediate release or restored and migrated in a rehearsal before production.
