import path from "node:path";
import { drizzle } from "drizzle-orm/postgres-js";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import postgres from "postgres";
import { loadRootEnv } from "./loadEnv";
import {
  loadRawMigrations,
  pendingRawMigrations,
  shouldBaselineRawMigrations,
} from "./rawMigrations";

loadRootEnv();

const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
  throw new Error("DATABASE_URL is required to run migrations");
}

async function main() {
  const client = postgres(connectionString!, { max: 1 });
  const db = drizzle(client);
  const releaseIdentifier =
    process.env.KOBI_RELEASE_ID ?? process.env.RAILWAY_GIT_COMMIT_SHA ?? process.env.GITHUB_SHA ?? "local";

  try {
    // A session-level lock serializes the complete schema transition, including
    // Drizzle migrations, across concurrent deploys.
    await client`select pg_advisory_lock(hashtext('kobi_database_migrations'))`;

    // The vector extension must exist before drizzle-kit's migration runs,
    // since curriculum_chunks/activities declare `vector(768)` columns.
    await client.unsafe("create extension if not exists vector;");

    const rawHistoryTableState = await client<{ exists: boolean }[]>`
      select to_regclass('public.kobi_raw_migrations') is not null as exists
    `;
    const rawHistoryTableExisted = rawHistoryTableState[0]?.exists ?? false;
    const drizzleHistoryTableState = await client<{ exists: boolean }[]>`
      select to_regclass('drizzle.__drizzle_migrations') is not null as exists
    `;
    let preexistingDrizzleMigrationCount = 0;
    if (drizzleHistoryTableState[0]?.exists) {
      const drizzleHistory = await client<{ count: number }[]>`
        select count(*)::int as count
        from drizzle.__drizzle_migrations
      `;
      preexistingDrizzleMigrationCount = drizzleHistory[0]?.count ?? 0;
    }

    await client.unsafe(`
      create table if not exists public.kobi_raw_migrations (
        file_name text primary key,
        checksum text not null,
        applied_at timestamptz not null default now(),
        duration_ms integer not null check (duration_ms >= 0),
        release_identifier text not null
      );

      revoke all on table public.kobi_raw_migrations from anon, authenticated, public;
    `);

    const rawMigrations = loadRawMigrations(path.join(__dirname, "..", "migrations"));
    const appliedRows = await client<{ file_name: string; checksum: string }[]>`
      select file_name, checksum
      from public.kobi_raw_migrations
      order by file_name
    `;
    const applied = appliedRows.map((migration) => ({
      fileName: migration.file_name,
      checksum: migration.checksum,
    }));

    // Validate the raw history before Drizzle can make any schema changes.
    // The first upgrade after tracking was introduced is handled below by a
    // baseline after Drizzle succeeds.
    const pending = pendingRawMigrations(rawMigrations, applied);

    await migrate(db, { migrationsFolder: path.join(__dirname, "..", "drizzle") });

    if (shouldBaselineRawMigrations(rawHistoryTableExisted, applied, preexistingDrizzleMigrationCount)) {
      await client.begin(async (transaction) => {
        for (const migration of rawMigrations) {
          await transaction`
            insert into public.kobi_raw_migrations
              (file_name, checksum, duration_ms, release_identifier)
            values
              (${migration.fileName}, ${migration.checksum}, 0, ${releaseIdentifier})
          `;
        }
      });
      console.info(`Baselined ${rawMigrations.length} pre-existing raw migrations`);
    } else {
      for (const migration of pending) {
        const startedAt = Date.now();
        await client.begin(async (transaction) => {
          await transaction.unsafe(migration.sql);
          await transaction`
            insert into public.kobi_raw_migrations
              (file_name, checksum, duration_ms, release_identifier)
            values
              (${migration.fileName}, ${migration.checksum}, ${Date.now() - startedAt}, ${releaseIdentifier})
          `;
        });
        console.info(`Applied raw migration ${migration.fileName}`);
      }
    }
  } finally {
    await client`select pg_advisory_unlock(hashtext('kobi_database_migrations'))`.catch(() => undefined);
    await client.end();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
