const SENSITIVE_KEY = /(audio_?url|signed|token|authorization|transcript|prompt|response|body|name)/i;
const SAFE_MEASUREMENT_KEY = /^(transcriptBytes|sizeBytes|durationMs|latencyMs)$/;
const URL_PATTERN = /https?:\/\/[^\s"']+/gi;
const BEARER_PATTERN = /bearer\s+[a-z0-9._~+/=-]+/gi;

export type SafeErrorCategory =
  | "authentication"
  | "rate_limit"
  | "provider_unavailable"
  | "invalid_input"
  | "storage"
  | "database"
  | "unknown";

export function classifySafeError(error: unknown): SafeErrorCategory {
  const message = error instanceof Error ? error.message : String(error ?? "");
  if (/401|403|auth|api.?key|credential/i.test(message)) return "authentication";
  if (/429|rate.?limit|quota/i.test(message)) return "rate_limit";
  if (/timeout|timed out|502|503|504|unavailable/i.test(message)) return "provider_unavailable";
  if (/invalid|unsupported|required|400|422/i.test(message)) return "invalid_input";
  if (/storage|bucket|object/i.test(message)) return "storage";
  if (/database|postgres|relation|constraint/i.test(message)) return "database";
  return "unknown";
}

export function sanitizeLogDetails(details: Record<string, unknown>): Record<string, unknown> {
  return Object.fromEntries(
    Object.entries(details).map(([key, value]) => {
      if (SAFE_MEASUREMENT_KEY.test(key)) return [key, value];
      if (/^error$/i.test(key)) return [key, { category: classifySafeError(value) }];
      if (SENSITIVE_KEY.test(key)) return [key, "[REDACTED]"];
      if (value instanceof Error) return [key, { category: classifySafeError(value) }];
      if (typeof value === "string") {
        return [key, value.replace(URL_PATTERN, "[REDACTED_URL]").replace(BEARER_PATTERN, "[REDACTED_TOKEN]")];
      }
      return [key, value];
    }),
  );
}

export function safeLog(
  level: "info" | "warn" | "error",
  event: string,
  details: Record<string, unknown> = {},
): void {
  console[level](`[Kobi] ${event}`, sanitizeLogDetails(details));
}
