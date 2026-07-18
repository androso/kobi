import { parseArgs } from "node:util";
import { loadRootEnv } from "@kobi/db";
import { createClient } from "@supabase/supabase-js";
import { retrieveCurriculumMatches } from "../retrieveCurriculumMatches.js";

loadRootEnv();

async function main() {
  const { values } = parseArgs({
    options: {
      query: { type: "string" },
      grade: { type: "string", default: "7" },
      subject: { type: "string", default: "lenguaje" },
      unit: { type: "string" },
      "match-count": { type: "string", default: "3" },
    },
  });

  const queryText = parseRequiredString(values.query, "query");
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

  const supabase = createClient(supabaseUrl, serviceRoleKey);
  const matches = await retrieveCurriculumMatches(supabase, {
    queryText,
    grade: parsePositiveInteger(parseRequiredString(values.grade, "grade"), "grade"),
    subject: parseRequiredString(values.subject, "subject"),
    unit: parseOptionalString(values.unit, "unit"),
    matchCount: parsePositiveInteger(parseRequiredString(values["match-count"], "match-count"), "match-count"),
  });

  console.log(JSON.stringify(matches, null, 2));
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

function parsePositiveInteger(value: string, name: string): number {
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed <= 0) {
    throw new Error(`--${name} must be a positive integer`);
  }
  return parsed;
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
