import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { drizzle } from "drizzle-orm/postgres-js";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import postgres from "postgres";
import { loadRootEnv } from "./loadEnv";

loadRootEnv();

const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
  throw new Error("DATABASE_URL is required to run migrations");
}

async function main() {
  const client = postgres(connectionString!, { max: 1 });
  const db = drizzle(client);

  // The vector extension must exist before drizzle-kit's migration runs,
  // since curriculum_chunks/activities declare `vector(768)` columns.
  await client.unsafe("create extension if not exists vector;");

  await migrate(db, { migrationsFolder: path.join(__dirname, "..", "drizzle") });

  // Raw SQL migrations cover constraints, custom indexes, and RPCs that aren't
  // expressible through drizzle-kit. They must be idempotent.
  const rawMigrationsDir = path.join(__dirname, "..", "migrations");
  for (const fileName of readdirSync(rawMigrationsDir).filter((file) => file.endsWith(".sql")).sort()) {
    const sql = readFileSync(path.join(rawMigrationsDir, fileName), "utf8");
    await client.unsafe(sql);
  }

  await client.end();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
