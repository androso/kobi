import { drizzle } from "drizzle-orm/postgres-js";
import type { PostgresJsDatabase } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema/index.js";

let db: PostgresJsDatabase<typeof schema> | undefined;

/** Single Drizzle client for the process, backed by DATABASE_URL (postgres.js driver). */
export function getDb(): PostgresJsDatabase<typeof schema> {
  if (!db) {
    const connectionString = process.env.DATABASE_URL;
    if (!connectionString) {
      throw new Error("DATABASE_URL is required for the @kobi/db client");
    }
    db = drizzle(postgres(connectionString), { schema });
  }
  return db;
}
