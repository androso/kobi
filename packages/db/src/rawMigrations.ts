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
  const migrationByFileName = new Map(migrations.map((migration) => [migration.fileName, migration]));
  const appliedByFileName = new Map(
    appliedMigrations.map((migration) => [migration.fileName, migration.checksum]),
  );

  for (const appliedMigration of appliedMigrations) {
    if (!migrationByFileName.has(appliedMigration.fileName)) {
      throw new Error(
        `Applied raw migration ${appliedMigration.fileName} is missing from the migrations directory; ` +
          "restore the original file instead of deleting or renaming an applied migration.",
      );
    }
  }

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

  const highestAppliedFileName = appliedMigrations.reduce(
    (highest, migration) => (migration.fileName > highest ? migration.fileName : highest),
    "",
  );
  const pending = migrations.filter((migration) => !appliedByFileName.has(migration.fileName));
  const outOfOrderMigration = pending.find((migration) => migration.fileName < highestAppliedFileName);
  if (outOfOrderMigration) {
    throw new Error(
      `Raw migration ${outOfOrderMigration.fileName} was added before the highest applied migration ` +
        `${highestAppliedFileName}; add new raw migrations with a higher filename so clean installs and ` +
        "upgrades execute the same sequence.",
    );
  }

  return pending;
}

export function shouldBaselineRawMigrations(
  appliedMigrations: AppliedRawMigration[],
  preexistingDrizzleMigrationCount: number,
): boolean {
  return appliedMigrations.length === 0 && preexistingDrizzleMigrationCount > 0;
}
