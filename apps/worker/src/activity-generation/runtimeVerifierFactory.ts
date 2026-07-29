import {
  createModalActivityRuntimeVerifier,
  type ModalRuntimeVerifierConfig,
} from "./modalRuntimeVerifier.js";
import {
  verifyActivityRuntime,
  type ActivityRuntimeVerifier,
} from "./runtimeVerifier.js";

export type ActivityRuntimeVerifierBackend = "local" | "modal";

export interface ActivityRuntimeVerifierSelection {
  backend: ActivityRuntimeVerifierBackend;
  verifier: ActivityRuntimeVerifier;
}

export function createActivityRuntimeVerifierFromEnv(
  env: NodeJS.ProcessEnv = process.env,
): ActivityRuntimeVerifierSelection {
  const backend = readActivityRuntimeVerifierBackend(env);
  if (backend === "local") return { backend, verifier: verifyActivityRuntime };

  const config = readModalRuntimeVerifierConfig(env);
  return {
    backend,
    verifier: createModalActivityRuntimeVerifier(config),
  };
}

export function readActivityRuntimeVerifierBackend(
  env: NodeJS.ProcessEnv = process.env,
): ActivityRuntimeVerifierBackend {
  const configured = env.ACTIVITY_RUNTIME_VERIFIER?.trim().toLowerCase();
  if (configured === "local" || configured === "modal") return configured;
  if (configured) {
    throw new Error(
      `ACTIVITY_RUNTIME_VERIFIER must be "local" or "modal"; received ${JSON.stringify(configured)}`,
    );
  }
  return env.NODE_ENV === "production" ? "modal" : "local";
}

export function readModalRuntimeVerifierConfig(
  env: NodeJS.ProcessEnv = process.env,
): ModalRuntimeVerifierConfig {
  const tokenId = requiredEnv(env, "MODAL_TOKEN_ID");
  const tokenSecret = requiredEnv(env, "MODAL_TOKEN_SECRET");
  const playwrightVersion = env.MODAL_ACTIVITY_PLAYWRIGHT_VERSION?.trim() || "1.61.1";

  return {
    tokenId,
    tokenSecret,
    appName: env.MODAL_ACTIVITY_APP?.trim() || "kobi-activity-foundry",
    ...(env.MODAL_ENVIRONMENT?.trim()
      ? { environment: env.MODAL_ENVIRONMENT.trim() }
      : {}),
    image:
      env.MODAL_ACTIVITY_IMAGE?.trim()
      || `mcr.microsoft.com/playwright:v${playwrightVersion}-noble`,
    playwrightVersion,
    timeoutMs: positiveInteger(env.MODAL_ACTIVITY_TIMEOUT_MS, 30_000),
    cpu: positiveNumber(env.MODAL_ACTIVITY_CPU, 0.5),
    cpuLimit: positiveNumber(env.MODAL_ACTIVITY_CPU_LIMIT, 1),
    memoryMiB: positiveInteger(env.MODAL_ACTIVITY_MEMORY_MIB, 512),
    memoryLimitMiB: positiveInteger(env.MODAL_ACTIVITY_MEMORY_LIMIT_MIB, 1_024),
  };
}

function requiredEnv(env: NodeJS.ProcessEnv, name: string): string {
  const value = env[name]?.trim();
  if (!value) {
    throw new Error(
      `${name} is required when ACTIVITY_RUNTIME_VERIFIER=modal`,
    );
  }
  return value;
}

function positiveInteger(value: string | undefined, fallback: number): number {
  if (!value?.trim()) return fallback;
  const parsed = Number.parseInt(value, 10);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    throw new Error(`Expected a positive integer, received ${JSON.stringify(value)}`);
  }
  return parsed;
}

function positiveNumber(value: string | undefined, fallback: number): number {
  if (!value?.trim()) return fallback;
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    throw new Error(`Expected a positive number, received ${JSON.stringify(value)}`);
  }
  return parsed;
}