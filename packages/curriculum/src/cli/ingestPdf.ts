import { parseArgs } from "node:util";
import { loadRootEnv } from "@kobi/db";
import { createClient } from "@supabase/supabase-js";
import type { SupabaseClient } from "@supabase/supabase-js";
import { digestTextbookPdf } from "../digestTextbookPdf.js";

loadRootEnv();

async function main() {
  const { values } = parseArgs({
    options: {
      source: { type: "string" },
      grade: { type: "string", default: "7" },
      subject: { type: "string", default: "lenguaje" },
      document: { type: "string" },
      unit: { type: "string" },
      "page-start": { type: "string" },
      "page-end": { type: "string" },
      "replace-source": { type: "boolean", default: false },
      "dry-run": { type: "boolean", default: false },
      "min-text-page-coverage": { type: "string", default: "0.8" },
      "embed-concurrency": { type: "string", default: "3" },
      "insert-batch-size": { type: "string", default: "50" },
    },
  });

  if (!values.source) {
    throw new Error("Missing --source path to the textbook PDF");
  }
  const source = parseRequiredString(values.source, "source");
  const subject = parseRequiredString(values.subject, "subject");
  const dryRun = parseBoolean(values["dry-run"], "dry-run");

  const supabase = dryRun ? ({} as SupabaseClient) : createServiceRoleClient();
  const result = await digestTextbookPdf(supabase, {
    sourcePath: source,
    grade: parsePositiveInteger(parseRequiredString(values.grade, "grade"), "grade"),
    subject,
    sourceDocument: parseOptionalString(values.document, "document"),
    unit: parseOptionalString(values.unit, "unit"),
    pageStart: parseOptionalPositiveInteger(parseOptionalString(values["page-start"], "page-start"), "page-start"),
    pageEnd: parseOptionalPositiveInteger(parseOptionalString(values["page-end"], "page-end"), "page-end"),
    replaceSource: parseBoolean(values["replace-source"], "replace-source"),
    dryRun,
    minTextPageCoverage: parseRatio(
      parseRequiredString(values["min-text-page-coverage"], "min-text-page-coverage"),
      "min-text-page-coverage",
    ),
    embedConcurrency: parsePositiveInteger(
      parseRequiredString(values["embed-concurrency"], "embed-concurrency"),
      "embed-concurrency",
    ),
    insertBatchSize: parsePositiveInteger(
      parseRequiredString(values["insert-batch-size"], "insert-batch-size"),
      "insert-batch-size",
    ),
  });

  console.log(JSON.stringify(result, null, 2));
}

function createServiceRoleClient(): SupabaseClient {
  const supabaseUrl =
    process.env.SUPABASE_URL ??
    process.env.NEXT_PUBLIC_SUPABASE_URL ??
    process.env.VITE_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl) {
    throw new Error("Missing SUPABASE_URL, NEXT_PUBLIC_SUPABASE_URL, or VITE_SUPABASE_URL");
  }
  if (!serviceRoleKey) {
    throw new Error("Missing SUPABASE_SERVICE_ROLE_KEY");
  }

  return createClient(supabaseUrl, serviceRoleKey);
}

function parseRequiredString(value: string | boolean | undefined, name: string): string {
  if (typeof value !== "string" || !value.trim()) {
    throw new Error(`--${name} must be a non-empty string`);
  }
  return value;
}

function parseOptionalString(value: string | boolean | undefined, name: string): string | undefined {
  if (value === undefined) return undefined;
  if (typeof value !== "string") {
    throw new Error(`--${name} must be a string`);
  }
  return value.trim() || undefined;
}

function parseBoolean(value: string | boolean | undefined, name: string): boolean {
  if (value === undefined) return false;
  if (typeof value !== "boolean") {
    throw new Error(`--${name} must be a boolean flag`);
  }
  return value;
}

function parsePositiveInteger(value: string, name: string): number {
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed <= 0) {
    throw new Error(`--${name} must be a positive integer`);
  }
  return parsed;
}

function parseOptionalPositiveInteger(value: string | undefined, name: string): number | undefined {
  return value === undefined ? undefined : parsePositiveInteger(value, name);
}

function parseRatio(value: string, name: string): number {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < 0 || parsed > 1) {
    throw new Error(`--${name} must be a number between 0 and 1`);
  }
  return parsed;
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
