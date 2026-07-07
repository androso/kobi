export * from "./types.js";
export * from "./telemetry.js";

import { activitySdkMessageSchema } from "./types.js";

export function validateActivitySdkMessage(message: unknown) {
  return activitySdkMessageSchema.safeParse(message);
}
