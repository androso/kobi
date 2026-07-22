import {
  ACTIVITY_SDK_VERSION,
  activitySdkEventSchema,
  activitySdkRequestSchema,
  type ActivityManifest,
} from "@kobi/activities/server";
import { chromium, type Browser, type Locator, type Page } from "playwright";

const activityIframeCsp = [
  "default-src 'none'",
  "script-src 'unsafe-inline'",
  "style-src 'unsafe-inline'",
  "img-src data:",
  "connect-src 'none'",
  "font-src 'none'",
  "frame-src 'none'",
  "object-src 'none'",
  "base-uri 'none'",
  "form-action 'none'",
  "navigate-to 'none'",
].join("; ");

const smokeAssignmentId = "runtime-verifier-assignment";
const smokeTitle = "Runtime injected title 4b26f9";
const smokePrompt = "Runtime injected prompt 7c81da";
const smokeAnswer = "runtime-injected-answer-2e95cb";
const smokeHint = "Runtime injected hint 19d40a";
const defaultTimeoutMs = 5_000;

export interface ActivityRuntimeVerificationInput {
  bundleHtml: string;
  manifest: ActivityManifest;
  timeoutMs?: number;
}

export interface ActivityRuntimeVerificationResult {
  requests: Array<"getManifest" | "getBand">;
  events: Array<"reportAttempt" | "reportHint" | "reportComplete">;
}

export async function verifyActivityRuntime(
  input: ActivityRuntimeVerificationInput,
): Promise<ActivityRuntimeVerificationResult> {
  assertEditableContentIsNotEmbedded(input.bundleHtml, input.manifest);
  const runtimeManifest = manifestWithSmokeContent(input.manifest);
  const timeoutMs = input.timeoutMs ?? defaultTimeoutMs;
  let browser: Browser | undefined;
  const runtimeErrors: string[] = [];
  try {
    browser = await chromium.launch({ headless: true });
    const page = await browser.newPage();
    page.on("pageerror", (error) => runtimeErrors.push(`page error: ${error.message}`));
    page.on("console", (message) => {
      const text = message.text();
      const isHostCspCompatibilityDiagnostic =
        text === "Unrecognized Content-Security-Policy directive 'navigate-to'.";
      if (message.type() === "error" && !isHostCspCompatibilityDiagnostic) {
        runtimeErrors.push(`console error: ${text}`);
      }
    });

    await installSandboxHost(page, input.bundleHtml, runtimeManifest);
    const frame = page.frameLocator("#activity-host");
    await frame.locator("body").waitFor({ state: "attached", timeout: timeoutMs });
    await waitForSdkMessage(page, "request", "getManifest", timeoutMs);
    await waitForSdkMessage(page, "request", "getBand", timeoutMs);

    await frame.getByText(smokeTitle, { exact: false }).waitFor({ state: "visible", timeout: timeoutMs });
    await frame.getByText(smokePrompt, { exact: false }).waitFor({ state: "visible", timeout: timeoutMs });
    const renderedText = await frame.locator("body").innerText({ timeout: timeoutMs });
    if (!renderedText.includes(smokeTitle) || !renderedText.includes(smokePrompt)) {
      throw new Error(
        "rendered activity did not display the title and prompt supplied by the runtime manifest",
      );
    }

    await clickSmokeControl(frame.locator('[data-smoke-action="attempt"], #attempt, .option'), "attempt", timeoutMs);
    await waitForSdkMessage(page, "event", "reportAttempt", timeoutMs);
    await clickSmokeControl(frame.locator('[data-smoke-action="hint"], #hint'), "hint", timeoutMs);
    await waitForSdkMessage(page, "event", "reportHint", timeoutMs);
    await clickSmokeControl(frame.locator('[data-smoke-action="complete"], #complete'), "complete", timeoutMs);
    await waitForSdkMessage(page, "event", "reportComplete", timeoutMs);

    if (runtimeErrors.length > 0) {
      throw new Error(runtimeErrors.join("; "));
    }

    return validatedTraffic(await readSdkMessages(page));
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const diagnostics = runtimeErrors.length > 0 ? `; ${runtimeErrors.join("; ")}` : "";
    throw new Error(`activity runtime verification failed: ${message}${diagnostics}`, { cause: error });
  } finally {
    await browser?.close();
  }
}

function assertEditableContentIsNotEmbedded(bundleHtml: string, manifest: ActivityManifest): void {
  const editableValues = manifest.content.items.flatMap((item) => [...item.answer_key, ...item.hints]);
  for (const value of editableValues) {
    const variants = [value, escapeHtml(value), JSON.stringify(value).slice(1, -1)];
    if (variants.some((variant) => variant.length > 0 && bundleHtml.includes(variant))) {
      throw new Error(`activity source embeds editable answer or hint content: ${JSON.stringify(value)}`);
    }
  }
}

function manifestWithSmokeContent(manifest: ActivityManifest): ActivityManifest {
  const firstItem = manifest.content.items[0];
  if (!firstItem) throw new Error("activity manifest has no content item for runtime verification");
  return {
    ...manifest,
    title: smokeTitle,
    content: {
      ...manifest.content,
      items: [
        { ...firstItem, prompt: smokePrompt, answer_key: [smokeAnswer], hints: [smokeHint] },
        ...manifest.content.items.slice(1),
      ],
    },
  };
}

async function installSandboxHost(
  page: Page,
  bundleHtml: string,
  manifest: ActivityManifest,
): Promise<void> {
  const manifestJson = safeInlineJson(manifest);
  const bandJson = safeInlineJson(manifest.difficulty_band);
  await page.setContent(`<!doctype html><html><body data-sdk-messages="[]">
    <iframe id="activity-host" sandbox="allow-scripts" referrerpolicy="no-referrer"></iframe>
    <script>
      const messages = [];
      window.addEventListener("message", (event) => {
        if (event.source === window) return;
        const data = event.data;
        if (!data || data.sdk !== ${JSON.stringify(ACTIVITY_SDK_VERSION)}) return;
        messages.push(data);
        document.body.dataset.sdkMessages = JSON.stringify(messages);
        if (data.type !== "request") return;
        const result = data.method === "getManifest" ? ${manifestJson} : ${bandJson};
        event.source.postMessage({ sdk: ${JSON.stringify(ACTIVITY_SDK_VERSION)}, type: "response", id: data.id, ok: true, result }, "*");
      });
    </script>
  </body></html>`);
  const securedHtml = secureActivityHtml(bundleHtml);
  const iframe = page.locator("#activity-host");
  await iframe.evaluate((element, html) => {
    if (!(element instanceof HTMLIFrameElement)) throw new Error("activity host is not an iframe");
    element.srcdoc = html;
  }, securedHtml);
}

function secureActivityHtml(bundleHtml: string): string {
  const cspMeta = `<meta http-equiv="Content-Security-Policy" content="${activityIframeCsp}">`;
  const doctype = bundleHtml.match(
    /^\s*(?:<!--[\s\S]*?-->\s*)*<!doctype\b[^>]*>/i,
  )?.[0];
  return doctype
    ? `${doctype}${cspMeta}${bundleHtml.slice(doctype.length)}`
    : `${cspMeta}${bundleHtml}`;
}

async function clickSmokeControl(
  locator: Locator,
  action: string,
  timeoutMs: number,
): Promise<void> {
  const control = locator.first();
  try {
    await control.click({ timeout: timeoutMs });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`non-runnable ${action} smoke control: ${message}`, { cause: error });
  }
}

async function waitForSdkMessage(
  page: Page,
  type: "request" | "event",
  method: string,
  timeoutMs: number,
): Promise<void> {
  try {
    await page.waitForFunction(
      ({ expectedType, expectedMethod }) => {
        const raw = document.body.dataset.sdkMessages ?? "[]";
        const messages = JSON.parse(raw);
        return Array.isArray(messages) && messages.some((message) =>
          message && typeof message === "object" && message.type === expectedType && message.method === expectedMethod
        );
      },
      { expectedType: type, expectedMethod: method },
      { timeout: timeoutMs },
    );
  } catch (error) {
    throw new Error(`timed out waiting for SDK ${type} ${method}`, { cause: error });
  }
}

async function readSdkMessages(page: Page): Promise<unknown[]> {
  const raw = await page.locator("body").getAttribute("data-sdk-messages");
  const parsed: unknown = JSON.parse(raw ?? "[]");
  if (!Array.isArray(parsed)) throw new Error("runtime SDK traffic was not an array");
  return parsed;
}

function validatedTraffic(messages: unknown[]): ActivityRuntimeVerificationResult {
  const requests: ActivityRuntimeVerificationResult["requests"] = [];
  const events: ActivityRuntimeVerificationResult["events"] = [];

  for (const message of messages) {
    const request = activitySdkRequestSchema.safeParse(message);
    if (request.success) {
      requests.push(request.data.method);
      continue;
    }

    const withAssignment = addParentAssignmentId(message);
    const event = activitySdkEventSchema.safeParse(withAssignment);
    if (event.success) events.push(event.data.method);
  }

  for (const method of ["getManifest", "getBand"] as const) {
    if (!requests.includes(method)) throw new Error(`missing valid SDK request: ${method}`);
  }
  for (const method of ["reportAttempt", "reportHint", "reportComplete"] as const) {
    if (!events.includes(method)) throw new Error(`missing structurally valid SDK event: ${method}`);
  }
  return { requests, events };
}

function addParentAssignmentId(message: unknown): unknown {
  if (!message || typeof message !== "object" || !("payload" in message)) return message;
  const payload = message.payload;
  if (!payload || typeof payload !== "object" || "assignment_id" in payload) return message;
  return { ...message, payload: { ...payload, assignment_id: smokeAssignmentId } };
}


function safeInlineJson(value: unknown): string {
  return JSON.stringify(value).replaceAll("<", "\\u003c").replaceAll("\u2028", "\\u2028").replaceAll("\u2029", "\\u2029");
}

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}
