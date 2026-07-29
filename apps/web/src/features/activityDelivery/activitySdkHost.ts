import {
  ACTIVITY_SDK_VERSION,
  activitySdkMessageSchema,
  type ActivityManifest,
  type DifficultyBand,
} from "@kobi/activities/contracts";

export interface ActivitySdkRequestHost {
  iframe: HTMLIFrameElement;
  manifest: ActivityManifest;
  band: DifficultyBand;
}

const awaitingOpaqueSource = new WeakSet<HTMLIFrameElement>();
const opaqueSourceByIframe = new WeakMap<HTMLIFrameElement, MessageEventSource>();

/**
 * Sandboxed srcdoc iframes are opaque: event.source will not equal iframe.contentWindow.
 * Call this whenever a new secured bundle is mounted into the iframe.
 */
export function markActivityIframeAwaitingSource(iframe: HTMLIFrameElement): void {
  awaitingOpaqueSource.add(iframe);
  opaqueSourceByIframe.delete(iframe);
}

function bindIframeSource(event: MessageEvent, iframe: HTMLIFrameElement): boolean {
  const contentWindow = iframe.contentWindow;
  if (contentWindow && event.source === contentWindow) {
    opaqueSourceByIframe.set(iframe, event.source);
    awaitingOpaqueSource.delete(iframe);
    return true;
  }

  if (!event.source) return false;
  const trackedSource = opaqueSourceByIframe.get(iframe);
  if (trackedSource && event.source === trackedSource) return true;

  if (event.origin !== "null") return false;
  if (!iframe.getAttribute("srcdoc") && !iframe.src) return false;
  if (!awaitingOpaqueSource.has(iframe) && !trackedSource) return false;

  opaqueSourceByIframe.set(iframe, event.source);
  awaitingOpaqueSource.delete(iframe);
  return true;
}

function isKnownIframeSource(event: MessageEvent, iframe: HTMLIFrameElement): boolean {
  if (event.source === window) return false;
  return bindIframeSource(event, iframe);
}

/**
 * Returns true when the message is a valid SDK request from the given activity iframe.
 */
export function isActivitySdkRequestFromIframe(
  event: MessageEvent,
  iframe: HTMLIFrameElement,
): boolean {
  const parsed = activitySdkMessageSchema.safeParse(event.data);
  return parsed.success && parsed.data.type === "request" && isKnownIframeSource(event, iframe);
}

/**
 * Returns true when the message is a valid SDK telemetry event from the given activity iframe.
 */
export function isActivitySdkTelemetryFromIframe(
  event: MessageEvent,
  iframe: HTMLIFrameElement,
): boolean {
  const parsed = activitySdkMessageSchema.safeParse(event.data);
  return parsed.success && parsed.data.type === "event" && isKnownIframeSource(event, iframe);
}

/**
 * Answers manifest-owned SDK requests from one specific activity iframe.
 * Returns true only when the event was a valid request from that iframe.
 */
export function respondToActivitySdkRequest(
  event: MessageEvent,
  host: ActivitySdkRequestHost,
): boolean {
  if (!isActivitySdkRequestFromIframe(event, host.iframe)) return false;

  const parsed = activitySdkMessageSchema.safeParse(event.data);
  if (!parsed.success || parsed.data.type !== "request") return false;

  const target = event.source;
  if (!target || typeof (target as Window).postMessage !== "function") return false;

  (target as Window).postMessage(
    {
      sdk: ACTIVITY_SDK_VERSION,
      type: "response",
      id: parsed.data.id,
      ok: true,
      result: parsed.data.method === "getManifest" ? host.manifest : host.band,
    },
    "*",
  );
  return true;
}
