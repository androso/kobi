import { readFile, stat } from "node:fs/promises";
import { relative, resolve, sep } from "node:path";

const root = resolve(import.meta.dirname, "..");
const maxGeneratedBytes = 1_000_000;
const fixturePrefix = "scripts/fixtures/repository-hygiene/";
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
  ["GitHub token", /\b(?:ghp|github_pat)_[A-Za-z0-9_]{20,}\b/],
  ["OpenAI key", /\bsk-(?:proj-)?[A-Za-z0-9_-]{20,}\b/],
  ["Supabase service-role JWT", /\beyJ[A-Za-z0-9_-]+\.eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\b/],
];

export async function inspectFiles(paths) {
  const violations = [];
  for (const inputPath of paths) {
    const absolutePath = resolve(root, inputPath);
    const repoPath = relative(root, absolutePath).split(sep).join("/");
    const metadata = await stat(absolutePath).catch((error) => {
      if (error?.code === "ENOENT") return null;
      throw error;
    });
    if (!metadata) continue;

    if (!repoPath.includes("/") && suspiciousRootNames.has(repoPath.toLowerCase())) {
      violations.push(`${repoPath}: suspicious root artifact name`);
    }
    if (metadata.size > maxGeneratedBytes && !allowedLargeFiles.has(repoPath)) {
      violations.push(`${repoPath}: unexpectedly large tracked file (${metadata.size} bytes)`);
    }

    const bytes = await readFile(absolutePath);
    if (bytes.includes(0)) continue;
    const text = bytes.toString("utf8");
    if (ansiPattern.test(text)) violations.push(`${repoPath}: terminal ANSI escape sequence`);
    for (const [label, pattern] of secretPatterns) {
      if (pattern.test(text)) violations.push(`${repoPath}: credential-shaped content (${label})`);
    }
  }
  return violations;
}

async function trackedFiles() {
  let input = "";
  for await (const chunk of process.stdin) input += chunk;
  return input
    .split("\0")
    .filter((path) => path && !path.startsWith(fixturePrefix));
}

function assertGeneratedFilesAreDocumented(paths) {
  const tracked = new Set(paths);
  return [...allowedGeneratedFiles]
    .filter((path) => !tracked.has(path))
    .map((path) => `${path}: documented generated file is missing`);
}

if (process.argv[1] === import.meta.filename) {
  const paths = await trackedFiles();
  const violations = [
    ...(await inspectFiles(paths)),
    ...assertGeneratedFilesAreDocumented(paths),
  ];
  if (violations.length > 0) {
    console.error(`Repository hygiene check failed:\n${violations.map((item) => `- ${item}`).join("\n")}`);
    process.exit(1);
  }
  console.log(`Repository hygiene check passed (${paths.length} files inspected).`);
}
