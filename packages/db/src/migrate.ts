import { readFileSync } from "node:fs";
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

  // The ivfflat index and match_curriculum_chunks() RPC aren't expressible
  // via drizzle-kit (custom access method / raw SQL function) — applied here
  // as idempotent SQL, after the tables they depend on already exist.
  const vectorExtrasSql = readFileSync(
    path.join(__dirname, "..", "migrations", "0002_vector_extras.sql"),
    "utf8",
  );
  await client.unsafe(vectorExtrasSql);

  await client.end();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
