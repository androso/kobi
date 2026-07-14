import { lstat, readFile } from "node:fs/promises";
import { execFile as execFileCallback } from "node:child_process";
import { relative, resolve, sep } from "node:path";
import { promisify } from "node:util";

const root = resolve(import.meta.dirname, "..");
const maxGeneratedBytes = 1_000_000;
const expectedAnsiFixture = "scripts/fixtures/repository-hygiene/ansi-terminal-dump.txt";
const allowedLargeFiles = new Set([]);
const allowedGeneratedFiles = new Set([
  "apps/web/public/auth/curriculum.png",
  "apps/web/public/auth/live-session.png",
  "apps/web/public/auth/students.png",
  "packages/db/drizzle/0000_hard_mastermind.sql",
  "packages/db/drizzle/0001_session_activity_candidates_backfill.sql",
  "packages/db/drizzle/0002_sparkling_sharon_carter.sql",
  "packages/db/drizzle/meta/0000_snapshot.json",
  "packages/db/drizzle/meta/0002_snapshot.json",
  "packages/db/drizzle/meta/_journal.json",
  "pnpm-lock.yaml",
]);
const suspiciousRootNames = new Set([
  "q",
  "branches",
  "branches.txt",
  "git-output.txt",
  "git-status.txt",
  "terminal-output.txt",
]);
const ansiPattern = /\x1b\[[0-?]*[ -/]*[@-~]/;
const secretPatterns = [
  ["private key", /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/],
  ["GitHub token", /\b(?:ghp|github_pat|gho|ghu|ghs|ghr)_[A-Za-z0-9_]{20,}\b/],
  ["OpenAI key", /\bsk-(?:proj-)?[A-Za-z0-9_-]{20,}\b/],
  ["Supabase service-role JWT", /\beyJ[A-Za-z0-9_-]+\.eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\b/],
];
const execFile = promisify(execFileCallback);

async function readStagedBlob(repoPath) {
  const { stdout: sizeOutput } = await execFile("git", ["cat-file", "-s", `:${repoPath}`], {
    cwd: root,
    encoding: "utf8",
  });
  const size = Number(sizeOutput.trim());
  if (!Number.isSafeInteger(size)) {
    throw new Error(`Unable to determine staged blob size for ${repoPath}`);
  }
  if (size > maxGeneratedBytes && !allowedLargeFiles.has(repoPath)) {
    return { size, bytes: null };
  }

  const { stdout: bytes } = await execFile("git", ["cat-file", "blob", `:${repoPath}`], {
    cwd: root,
    encoding: "buffer",
    maxBuffer: maxGeneratedBytes + 1,
  });
  return { size, bytes };
}

async function cachedFiles() {
  const { stdout } = await execFile("git", ["ls-files", "--cached", "-z"], {
    cwd: root,
    encoding: "utf8",
  });
  return new Set(stdout.split("\0").filter(Boolean));
}

async function modifiedFiles() {
  const { stdout } = await execFile("git", ["ls-files", "--modified", "--others", "--exclude-standard", "-z"], {
    cwd: root,
    encoding: "utf8",
  });
  return new Set(stdout.split("\0").filter(Boolean));
}

function addContentViolations(repoPath, bytes, violations) {
  if (!bytes || bytes.includes(0)) return;
  const text = bytes.toString("utf8");
  if (ansiPattern.test(text)) violations.push(`${repoPath}: terminal ANSI escape sequence`);
  for (const [label, pattern] of secretPatterns) {
    if (pattern.test(text)) violations.push(`${repoPath}: credential-shaped content (${label})`);
  }
}

export async function inspectFiles(
  paths,
  {
    stagedPaths = new Set(),
    workingTreePaths = new Set(),
    readStagedBlob: loadStagedBlob = readStagedBlob,
    readWorkingTreeFile = readFile,
    statWorkingTreeFile = lstat,
  } = {},
) {
  const violations = [];
  for (const inputPath of paths) {
    const absolutePath = resolve(root, inputPath);
    const repoPath = relative(root, absolutePath).split(sep).join("/");
    if (!repoPath.includes("/") && suspiciousRootNames.has(repoPath.toLowerCase())) {
      violations.push(`${repoPath}: suspicious root artifact name`);
    }

    if (stagedPaths.has(repoPath)) {
      const staged = await loadStagedBlob(repoPath);
      if (staged.size > maxGeneratedBytes && !allowedLargeFiles.has(repoPath)) {
        violations.push(`${repoPath}: unexpectedly large tracked file (${staged.size} bytes)`);
      } else {
        addContentViolations(repoPath, staged.bytes, violations);
      }
    }

    const shouldInspectWorkingTree = workingTreePaths.has(repoPath) || !stagedPaths.has(repoPath);
    if (shouldInspectWorkingTree) {
      const metadata = await statWorkingTreeFile(absolutePath).catch((error) => {
        if (error?.code === "ENOENT") return null;
        throw error;
      });
      if (!metadata) continue;
      if (!metadata.isFile()) continue;

      if (metadata.size > maxGeneratedBytes && !allowedLargeFiles.has(repoPath)) {
        violations.push(`${repoPath}: unexpectedly large tracked file (${metadata.size} bytes)`);
      } else {
        const bytes = await readWorkingTreeFile(absolutePath);
        addContentViolations(repoPath, bytes, violations);
      }
    }
  }
  return violations;
}

export function filterScannedPaths(paths) {
  return paths.filter((path) => path !== expectedAnsiFixture);
}

async function trackedFiles() {
  let input = "";
  for await (const chunk of process.stdin) input += chunk;
  return {
    paths: filterScannedPaths(input.split("\0").filter(Boolean)),
    stagedPaths: await cachedFiles(),
    workingTreePaths: new Set(filterScannedPaths([...await modifiedFiles()])),
  };
}

function assertGeneratedFilesAreDocumented(paths) {
  const tracked = new Set(paths);
  return [...allowedGeneratedFiles]
    .filter((path) => !tracked.has(path))
    .map((path) => `${path}: documented generated file is missing`);
}

if (process.argv[1] === import.meta.filename) {
  const { paths, stagedPaths, workingTreePaths } = await trackedFiles();
  const violations = [
    ...(await inspectFiles(paths, { stagedPaths, workingTreePaths })),
    ...assertGeneratedFilesAreDocumented(paths),
  ];
  if (violations.length > 0) {
    console.error(`Repository hygiene check failed:\n${violations.map((item) => `- ${item}`).join("\n")}`);
    process.exit(1);
  }
  console.log(`Repository hygiene check passed (${paths.length} files inspected).`);
}
