import { randomUUID } from "node:crypto";

type Labels = Record<string, string | number | boolean>;

interface MetricSample {
  count: number;
  sum: number;
  max: number;
}

const counters = new Map<string, number>();
const timings = new Map<string, MetricSample>();
let acceptingTraffic = true;

function key(name: string, labels: Labels = {}) {
  const suffix = Object.entries(labels)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([label, value]) => `${label}=${value}`)
    .join(",");
  return suffix ? `${name}{${suffix}}` : name;
}

export function incrementMetric(name: string, labels: Labels = {}, amount = 1) {
  const metricKey = key(name, labels);
  counters.set(metricKey, (counters.get(metricKey) ?? 0) + amount);
}

export function observeMetric(name: string, milliseconds: number, labels: Labels = {}) {
  const metricKey = key(name, labels);
  const current = timings.get(metricKey) ?? { count: 0, sum: 0, max: 0 };
  timings.set(metricKey, {
    count: current.count + 1,
    sum: current.sum + milliseconds,
    max: Math.max(current.max, milliseconds),
  });
}

export async function measured<T>(name: string, labels: Labels, operation: () => Promise<T>) {
  const startedAt = performance.now();
  try {
    const result = await operation();
    incrementMetric(`${name}_total`, { ...labels, outcome: "success" });
    return result;
  } catch (error) {
    incrementMetric(`${name}_total`, { ...labels, outcome: "failure" });
    throw error;
  } finally {
    observeMetric(`${name}_duration_ms`, performance.now() - startedAt, labels);
  }
}

export function metricsSnapshot() {
  return {
    generatedAt: new Date().toISOString(),
    acceptingTraffic,
    counters: Object.fromEntries(counters),
    timings: Object.fromEntries(timings),
  };
}

export function correlationId(value?: string | string[]) {
  const candidate = Array.isArray(value) ? value[0] : value;
  return candidate?.trim().slice(0, 128) || randomUUID();
}

export function stopIntake() {
  acceptingTraffic = false;
}

export function isAcceptingTraffic() {
  return acceptingTraffic;
}
