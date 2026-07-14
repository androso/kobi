import assert from "node:assert/strict";
import { inspectFiles } from "./check-repository-hygiene.mjs";

const fixture = "scripts/fixtures/repository-hygiene/ansi-terminal-dump.txt";
const violations = await inspectFiles([fixture]);

assert.equal(violations.length, 1);
assert.match(violations[0], /terminal ANSI escape sequence/);

let workingTreeRead = false;
const oversizedViolations = await inspectFiles(["oversized.txt"], {
  statWorkingTreeFile: async () => ({ size: 1_000_001 }),
  readWorkingTreeFile: async () => {
    workingTreeRead = true;
    throw new Error("oversized files must not be read");
  },
});
assert.deepEqual(oversizedViolations, ["oversized.txt: unexpectedly large tracked file (1000001 bytes)"]);
assert.equal(workingTreeRead, false);

let stagedBlobRead = false;
let stagedWorkingTreeRead = false;
const stagedToken = `gho_${"A".repeat(24)}`;
const stagedViolations = await inspectFiles(["staged.txt"], {
  stagedPaths: new Set(["staged.txt"]),
  readStagedBlob: async () => {
    stagedBlobRead = true;
    return { size: stagedToken.length, bytes: Buffer.from(stagedToken) };
  },
  statWorkingTreeFile: async () => ({ size: 5 }),
  readWorkingTreeFile: async () => {
    stagedWorkingTreeRead = true;
    return Buffer.from("clean");
  },
});
assert.deepEqual(stagedViolations, ["staged.txt: credential-shaped content (GitHub token)"]);
assert.equal(stagedBlobRead, true);
assert.equal(stagedWorkingTreeRead, false);

let modifiedStagedBlobRead = false;
let modifiedWorkingTreeRead = false;
const modifiedViolations = await inspectFiles(["modified.txt"], {
  stagedPaths: new Set(["modified.txt"]),
  workingTreePaths: new Set(["modified.txt"]),
  readStagedBlob: async () => {
    modifiedStagedBlobRead = true;
    return { size: 5, bytes: Buffer.from("clean") };
  },
  statWorkingTreeFile: async () => ({ size: 28 }),
  readWorkingTreeFile: async () => {
    modifiedWorkingTreeRead = true;
    return Buffer.from(`ghs_${"C".repeat(24)}`);
  },
});
assert.deepEqual(modifiedViolations, ["modified.txt: credential-shaped content (GitHub token)"]);
assert.equal(modifiedStagedBlobRead, true);
assert.equal(modifiedWorkingTreeRead, true);

for (const prefix of ["ghp", "github_pat", "gho", "ghu", "ghs", "ghr"]) {
  const token = `${prefix}_${"B".repeat(24)}`;
  const tokenViolations = await inspectFiles(["token.txt"], {
    statWorkingTreeFile: async () => ({ size: token.length }),
    readWorkingTreeFile: async () => Buffer.from(token),
  });
  assert.deepEqual(tokenViolations, ["token.txt: credential-shaped content (GitHub token)"]);
}

console.log("Repository hygiene regression passed: ANSI, size, staged-blob, and GitHub-token checks work.");
