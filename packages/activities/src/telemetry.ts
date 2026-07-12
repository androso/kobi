import { activitySdkMessageSchema } from "./types.js";
import type { ActivitySdkEvent } from "./types.js";

export interface ParentTelemetryContext {
  assignmentId: string;
  sourceMatches: boolean;
  eventOrigin?: string;
  allowedOrigin?: string;
  maxPayloadBytes?: number;
  eventsInRateWindow?: number;
  maxEventsPerRateWindow?: number;
}

export interface AuthorizedTelemetryEvent {
  event_id: string;
  assignment_id: string;
  type: "attempt" | "hint" | "complete";
  payload: Record<string, unknown>;
}

export type AuthorizeTelemetryResult =
  | { ok: true; event: AuthorizedTelemetryEvent }
  | { ok: false; error: string };

const defaultMaxPayloadBytes = 2048;
const defaultMaxEventsPerRateWindow = 30;

export function authorizeActivityTelemetryMessage(
  message: unknown,
  context: ParentTelemetryContext,
): AuthorizeTelemetryResult {
  if (!context.sourceMatches) {
    return { ok: false, error: "message source does not match the activity iframe" };
  }

  if (context.allowedOrigin && context.eventOrigin !== context.allowedOrigin) {
    return { ok: false, error: "message origin is not allowed" };
  }

  if (
    (context.eventsInRateWindow ?? 0) >=
    (context.maxEventsPerRateWindow ?? defaultMaxEventsPerRateWindow)
  ) {
    return { ok: false, error: "telemetry rate limit exceeded" };
  }

  const parsed = activitySdkMessageSchema.safeParse(
    messageWithParentAssignmentId(message, context.assignmentId),
  );
  if (!parsed.success) {
    return { ok: false, error: "message does not match the Activity SDK schema" };
  }

  if (parsed.data.type !== "event") {
    return { ok: false, error: "SDK requests are not telemetry events" };
  }

  const payloadBytes = byteLengthUtf8(JSON.stringify(parsed.data.payload));
  if (payloadBytes > (context.maxPayloadBytes ?? defaultMaxPayloadBytes)) {
    return { ok: false, error: "telemetry payload is too large" };
  }

  if (parsed.data.payload.assignment_id !== context.assignmentId) {
    return { ok: false, error: "telemetry assignment does not match parent context" };
  }

  return {
    ok: true,
    event: {
      event_id: parsed.data.payload.event_id ?? crypto.randomUUID(),
      assignment_id: context.assignmentId,
      type: eventTypeFromSdkMethod(parsed.data.method),
      payload: payloadFromSdkEvent(parsed.data, context.assignmentId),
    },
  };
}

function eventTypeFromSdkMethod(method: ActivitySdkEvent["method"]) {
  if (method === "reportAttempt") return "attempt";
  if (method === "reportHint") return "hint";
  return "complete";
}

function messageWithParentAssignmentId(message: unknown, assignmentId: string): unknown {
  if (!isRecord(message) || message.type !== "event" || !isRecord(message.payload)) {
    return message;
  }

  if ("assignment_id" in message.payload) {
    return message;
  }

  return {
    ...message,
    payload: {
      ...message.payload,
      assignment_id: assignmentId,
    },
  };
}

function byteLengthUtf8(value: string): number {
  return new TextEncoder().encode(value).byteLength;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function payloadFromSdkEvent(event: ActivitySdkEvent, assignmentId: string): Record<string, unknown> {
  const { event_id: _eventId, ...payload } = event.payload;
  return {
    ...payload,
    assignment_id: assignmentId,
  };
}
