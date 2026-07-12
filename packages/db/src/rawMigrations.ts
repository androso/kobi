import { createHash } from "node:crypto";
import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";

export interface RawMigration {
  fileName: string;
  checksum: string;
  sql: string;
}

export interface AppliedRawMigration {
  fileName: string;
  checksum: string;
}

export function loadRawMigrations(directory: string): RawMigration[] {
  return readdirSync(directory)
    .filter((fileName) => fileName.endsWith(".sql"))
    .sort()
    .map((fileName) => {
      const sql = readFileSync(path.join(directory, fileName), "utf8");
      return {
        fileName,
        checksum: createHash("sha256").update(sql).digest("hex"),
        sql,
      };
    });
}

export function pendingRawMigrations(
  migrations: RawMigration[],
  appliedMigrations: AppliedRawMigration[],
): RawMigration[] {
  const appliedByFileName = new Map(
    appliedMigrations.map((migration) => [migration.fileName, migration.checksum]),
  );

  for (const migration of migrations) {
    const appliedChecksum = appliedByFileName.get(migration.fileName);
    if (appliedChecksum && appliedChecksum !== migration.checksum) {
      throw new Error(
        `Raw migration ${migration.fileName} was already applied with checksum ${appliedChecksum}, ` +
          `but the file now has checksum ${migration.checksum}. Applied migrations are immutable; ` +
          "restore the original file and add a new migration.",
      );
    }
  }

  return migrations.filter((migration) => !appliedByFileName.has(migration.fileName));
}
