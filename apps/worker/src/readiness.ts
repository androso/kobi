import type { SupabaseClient } from "@supabase/supabase-js";
import type PgBoss from "pg-boss";

const REQUIRED_CONFIG = ["DATABASE_URL", "SUPABASE_SERVICE_ROLE_KEY"] as const;

export interface ReadinessCheck {
  ok: boolean;
  latencyMs: number;
  error?: string;
}

export async function checkReadiness(supabase: SupabaseClient, boss: PgBoss, timeoutMs = 2_000) {
  const checks: Record<string, ReadinessCheck> = {};
  const missing = REQUIRED_CONFIG.filter((name) => !process.env[name]);
  const hasSupabaseUrl = Boolean(
    process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL ?? process.env.VITE_SUPABASE_URL,
  );
  checks.config = { ok: missing.length === 0 && hasSupabaseUrl, latencyMs: 0 };
  if (!checks.config.ok) checks.config.error = `missing: ${[...missing, ...(!hasSupabaseUrl ? ["SUPABASE_URL"] : [])].join(", ")}`;

  checks.database = await boundedCheck("database", timeoutMs, async () => {
    const { error } = await supabase.from("sessions").select("id", { head: true, count: "exact" }).limit(1);
    if (error) throw error;
  });
  checks.queue = await boundedCheck("queue", timeoutMs, async () => {
    await boss.getQueueSize("checkpoint-scheduler");
  });
  checks.storage = await boundedCheck("storage", timeoutMs, async () => {
    const bucket = process.env.AUDIO_BUCKET ?? "audio-chunks";
    const { error } = await supabase.storage.from(bucket).list("", { limit: 1 });
    if (error) throw error;
  });

  return { ok: Object.values(checks).every((check) => check.ok), checks };
}

async function boundedCheck(name: string, timeoutMs: number, operation: () => Promise<void>) {
  const startedAt = performance.now();
  try {
    await Promise.race([
      operation(),
      new Promise<never>((_, reject) => setTimeout(() => reject(new Error(`${name} timed out`)), timeoutMs)),
    ]);
    return { ok: true, latencyMs: Math.round(performance.now() - startedAt) };
  } catch (error) {
    return {
      ok: false,
      latencyMs: Math.round(performance.now() - startedAt),
      error: error instanceof Error ? error.message : String(error),
    };
  }
}
