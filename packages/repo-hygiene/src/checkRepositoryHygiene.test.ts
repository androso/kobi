import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { type FileRecord, scanRepository } from "./checkRepositoryHygiene.js";

const tempRoots: string[] = [];

afterEach(() => {
  for (const root of tempRoots.splice(0)) {
    rmSync(root, { recursive: true, force: true });
  }
});

describe("scanRepository", () => {
  it("rejects terminal ANSI output fixtures", () => {
    const issues = scanRepository("/repo", {
      files: [
        textFile(
          "fixtures/git-branches.txt",
          "\u001b[32m* main\u001b[0m\n  fix/p2-04-clean-accidental-root-files\n  remotes/origin/main\n"
        )
      ]
    });

    expect(issues).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ kind: "ansi-terminal-dump", path: "fixtures/git-branches.txt" })
      ])
    );
  });

  it("rejects known accidental root artifact names", () => {
    const issues = scanRepository("/repo", {
      files: [textFile("q", "  main\n* fix/p2-04-clean-accidental-root-files\n")]
    });

    expect(issues).toEqual(
      expect.arrayContaining([expect.objectContaining({ kind: "suspicious-root-artifact", path: "q" })])
    );
  });

  it("rejects obvious committed secret values", () => {
    // Construct the fake key at runtime so the test source itself is not flagged.
    const fakeKey = ["sk-", "testvalue12345678901234567890"].join("");
    const issues = scanRepository("/repo", {
      files: [textFile("docs/example.env", `OPENAI_API_KEY=${fakeKey}\n`)]
    });

    expect(issues).toEqual(
      expect.arrayContaining([expect.objectContaining({ kind: "secret", path: "docs/example.env" })])
    );
  });

  it("allows documented generated image assets over the size threshold", () => {
    const issues = scanRepository("/repo", {
      maxGeneratedFileBytes: 8,
      files: [textFile("apps/web/public/auth/students.png", "larger than eight bytes")]
    });

    expect(issues).toEqual([]);
  });

  it("rejects unexpectedly large generated files", () => {
    const issues = scanRepository("/repo", {
      maxGeneratedFileBytes: 8,
      files: [textFile("tmp/generated-report.html", "larger than eight bytes")]
    });

    expect(issues).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ kind: "large-generated-file", path: "tmp/generated-report.html" })
      ])
    );
  });

  it("can scan a temporary filesystem tree without git", () => {
    const root = mkdtempSync(join(tmpdir(), "kobi-hygiene-"));
    tempRoots.push(root);
    writeFileSync(join(root, "q"), "branch dump\n");

    const issues = scanRepository(root);

    expect(issues).toEqual(expect.arrayContaining([expect.objectContaining({ path: "q" })]));
  });
});

function textFile(path: string, text: string): FileRecord {
  return {
    path,
    size: Buffer.byteLength(text),
    readText: () => text
  };
}
