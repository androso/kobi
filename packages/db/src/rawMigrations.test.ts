import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { loadRawMigrations, pendingRawMigrations } from "./rawMigrations";

describe("raw migration tracking", () => {
  it("loads SQL files in filename order with stable SHA-256 checksums", () => {
    const directory = mkdtempSync(path.join(tmpdir(), "kobi-migrations-"));
    writeFileSync(path.join(directory, "0002_second.sql"), "select 2;\n");
    writeFileSync(path.join(directory, "0001_first.sql"), "select 1;\n");
    writeFileSync(path.join(directory, "README.md"), "ignored");

    const migrations = loadRawMigrations(directory);

    expect(migrations.map(({ fileName }) => fileName)).toEqual(["0001_first.sql", "0002_second.sql"]);
    expect(migrations[0]?.checksum).toMatch(/^[a-f0-9]{64}$/);
  });

  it("returns only migrations that have not been applied", () => {
    const migrations = [
      { fileName: "0001.sql", checksum: "one", sql: "select 1" },
      { fileName: "0002.sql", checksum: "two", sql: "select 2" },
    ];

    expect(pendingRawMigrations(migrations, [{ fileName: "0001.sql", checksum: "one" }])).toEqual([
      migrations[1],
    ]);
  });

  it("fails clearly when an applied migration file changes", () => {
    expect(() =>
      pendingRawMigrations(
        [{ fileName: "0001.sql", checksum: "new", sql: "select 2" }],
        [{ fileName: "0001.sql", checksum: "original" }],
      ),
    ).toThrow(/0001\.sql was already applied.*immutable.*add a new migration/);
  });
});
