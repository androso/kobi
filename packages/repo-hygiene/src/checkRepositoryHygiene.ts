import { execFileSync } from "node:child_process";
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { basename, extname, join, relative, resolve, sep } from "node:path";
import { cwd, exit } from "node:process";
import { fileURLToPath } from "node:url";

export type HygieneIssueKind =
  | "ansi-terminal-dump"
  | "terminal-artifact"
  | "suspicious-root-artifact"
  | "secret"
  | "large-generated-file";

export type HygieneIssue = {
  readonly kind: HygieneIssueKind;
  readonly path: string;
  readonly message: string;
};

export type FileRecord = {
  readonly path: string;
  readonly size: number;
  readonly readText: () => string;
};

type ScanOptions = {
  readonly maxGeneratedFileBytes?: number;
  readonly files?: readonly FileRecord[];
};

const DEFAULT_MAX_GENERATED_FILE_BYTES = 1024 * 1024;

const EXCLUDED_DIRECTORIES = new Set([
  ".git",
  ".next",
  ".turbo",
  "coverage",
  "dist",
  "node_modules",
  "playwright-report",
  "test-results"
]);

const TEXT_EXTENSIONS = new Set([
  "",
  ".cjs",
  ".css",
  ".csv",
  ".env",
  ".html",
  ".js",
  ".json",
  ".jsx",
  ".mjs",
  ".md",
  ".mdx",
  ".sql",
  ".svg",
  ".ts",
  ".tsx",
  ".txt",
  ".yaml",
  ".yml"
]);

const LARGE_FILE_ALLOWLIST = [
  /^pnpm-lock\.yaml$/,
  /^packages\/db\/drizzle\/meta\/[^/]+_snapshot\.json$/,
  /^apps\/web\/public\/auth\/[^/]+\.png$/,
  /^apps\/web\/public\/class_creation_illustration\.jpg$/
];

const ROOT_FILE_ALLOWLIST = new Set([
  "AGENTS.md",
  "README.md",
  "package.json",
  "pnpm-lock.yaml",
  "pnpm-workspace.yaml",
  "tsconfig.base.json"
]);

const SUSPICIOUS_ROOT_FILENAMES = new Set([
  "q",
  "q.txt",
  "branch",
  "branches",
  "git-branches",
  "git-output",
  "terminal-output"
]);

const SECRET_PATTERNS: ReadonlyArray<{ readonly name: string; readonly pattern: RegExp }> = [
  { name: "OpenAI API key", pattern: /\bsk-[A-Za-z0-9_-]{20,}\b/ },
  { name: "Gemini or Google API key", pattern: /\bAIza[0-9A-Za-z_-]{20,}\b/ },
  { name: "private key block", pattern: /-----BEGIN [A-Z ]*PRIVATE KEY-----/ },
  {
    name: "database URL with embedded credentials",
    pattern: /\b(?:DATABASE_URL|POSTGRES_URL)\s*=\s*['"]?postgres(?:ql)?:\/\/[^:\s/]+:[^@\s]+@/i
  },
  {
    name: "Supabase service role JWT",
    pattern: /\bSUPABASE_SERVICE_ROLE_KEY\s*=\s*['"]?eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+/i
  }
];

const ANSI_ESCAPE_PATTERN = /\x1B\[[0-?]*[ -/]*[@-~]/;
const GIT_BRANCH_DUMP_PATTERN =
  /(?:^|\n)\s*(?:\*|\+)?\s*(?:remotes\/origin\/|origin\/)?(?:fix|feat|feature|bugfix|chore|main|master|develop|release)\/?[A-Za-z0-9._/-]*(?:\n\s*(?:\*|\+)?\s*(?:remotes\/origin\/|origin\/)?[A-Za-z0-9._/-]+){2,}/;

export function scanRepository(root: string, options: ScanOptions = {}): HygieneIssue[] {
  const resolvedRoot = resolve(root);
  const files = options.files ?? listRepositoryFiles(resolvedRoot);
  const maxGeneratedFileBytes = options.maxGeneratedFileBytes ?? DEFAULT_MAX_GENERATED_FILE_BYTES;
  const issues: HygieneIssue[] = [];

  for (const file of files) {
    const normalizedPath = normalizePath(file.path);
    const rootName = normalizedPath.includes("/") ? null : normalizedPath;

    if (rootName && isSuspiciousRootArtifact(rootName)) {
      issues.push({
        kind: "suspicious-root-artifact",
        path: normalizedPath,
        message: `Suspicious root artifact "${rootName}" is not an application source file.`
      });
    }

    if (file.size > maxGeneratedFileBytes && !isLargeFileAllowlisted(normalizedPath)) {
      issues.push({
        kind: "large-generated-file",
        path: normalizedPath,
        message: `File is ${file.size} bytes, above the ${maxGeneratedFileBytes} byte repository hygiene limit.`
      });
    }

    if (!isTextFile(normalizedPath)) {
      continue;
    }

    const text = file.readText();

    if (ANSI_ESCAPE_PATTERN.test(text)) {
      issues.push({
        kind: "ansi-terminal-dump",
        path: normalizedPath,
        message: "ANSI terminal escape output must not be committed."
      });
    }

    if (GIT_BRANCH_DUMP_PATTERN.test(text)) {
      issues.push({
        kind: "terminal-artifact",
        path: normalizedPath,
        message: "Git branch-list terminal output must not be committed."
      });
    }

    for (const secretPattern of SECRET_PATTERNS) {
      if (secretPattern.pattern.test(text)) {
        issues.push({
          kind: "secret",
          path: normalizedPath,
          message: `Possible committed secret detected: ${secretPattern.name}.`
        });
      }
    }
  }

  return issues;
}

function findWorkspaceRoot(start: string): string {
  let current = resolve(start);

  while (true) {
    if (existsSync(join(current, "pnpm-workspace.yaml"))) {
      return current;
    }

    const parent = resolve(current, "..");
    if (parent === current) {
      return resolve(start);
    }
    current = parent;
  }
}

function listRepositoryFiles(root: string): FileRecord[] {
  const gitFiles = listGitVisibleFiles(root);
  const paths = gitFiles.length > 0 ? gitFiles : listFilesystemFiles(root);

  return paths.flatMap((path) => {
    const absolutePath = join(root, path);
    if (!existsSync(absolutePath)) {
      return [];
    }

    const stats = statSync(absolutePath);

    return [
      {
        path,
        size: stats.size,
        readText: () => readFileSync(absolutePath, "utf8")
      }
    ];
  });
}

function listGitVisibleFiles(root: string): string[] {
  try {
    const output = execFileSync("git", ["ls-files", "--cached", "--others", "--exclude-standard", "-z"], {
      cwd: root,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"]
    });

    return output
      .split("\0")
      .filter(Boolean)
      .filter((path) => !path.split("/").some((segment) => EXCLUDED_DIRECTORIES.has(segment)));
  } catch {
    return [];
  }
}

function listFilesystemFiles(root: string): string[] {
  const files: string[] = [];

  function visit(directory: string): void {
    for (const entry of readdirSync(directory, { withFileTypes: true })) {
      if (entry.isDirectory() && EXCLUDED_DIRECTORIES.has(entry.name)) {
        continue;
      }

      const absolutePath = join(directory, entry.name);
      if (entry.isDirectory()) {
        visit(absolutePath);
      } else if (entry.isFile()) {
        files.push(normalizePath(relative(root, absolutePath)));
      }
    }
  }

  visit(root);
  return files;
}

function normalizePath(path: string): string {
  return path.split(sep).join("/");
}

function isSuspiciousRootArtifact(name: string): boolean {
  if (ROOT_FILE_ALLOWLIST.has(name)) {
    return false;
  }

  if (SUSPICIOUS_ROOT_FILENAMES.has(name)) {
    return true;
  }

  return extname(name) === "" && basename(name).length <= 2;
}

function isLargeFileAllowlisted(path: string): boolean {
  return LARGE_FILE_ALLOWLIST.some((pattern) => pattern.test(path));
}

function isTextFile(path: string): boolean {
  return TEXT_EXTENSIONS.has(extname(path).toLowerCase());
}

function runCli(): void {
  const root = findWorkspaceRoot(cwd());
  const issues = scanRepository(root);

  if (issues.length === 0) {
    console.log("Repository hygiene check passed.");
    return;
  }

  console.error("Repository hygiene check failed:");
  for (const issue of issues) {
    console.error(`- [${issue.kind}] ${issue.path}: ${issue.message}`);
  }

  exit(1);
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  runCli();
}
