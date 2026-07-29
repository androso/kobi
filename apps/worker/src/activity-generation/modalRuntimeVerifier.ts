import { ModalClient, type Sandbox } from "modal";
import { z } from "zod";
import type { ActivityManifest } from "@kobi/activities/server";
import {
  assertActivityRuntimeSourceSeparation,
  validateActivityRuntimeTraffic,
  type ActivityRuntimeVerificationInput,
  type ActivityRuntimeVerificationResult,
  type ActivityRuntimeVerifier,
} from "./runtimeVerifier.js";

const modalHarnessResultSchema = z.object({
  ok: z.boolean(),
  messages: z.array(z.unknown()),
  error: z.string().nullable(),
});

export interface ModalRuntimeVerifierConfig {
  tokenId: string;
  tokenSecret: string;
  appName: string;
  environment?: string;
  image: string;
  playwrightVersion: string;
  timeoutMs: number;
  cpu: number;
  cpuLimit: number;
  memoryMiB: number;
  memoryLimitMiB: number;
}

export function createModalActivityRuntimeVerifier(
  config: ModalRuntimeVerifierConfig,
): ActivityRuntimeVerifier {
  return (input) => verifyActivityRuntimeInModal(input, config);
}

export async function verifyActivityRuntimeInModal(
  input: ActivityRuntimeVerificationInput,
  config: ModalRuntimeVerifierConfig,
): Promise<ActivityRuntimeVerificationResult> {
  assertActivityRuntimeSourceSeparation(input.bundleHtml, input.manifest);

  const modal = new ModalClient({
    tokenId: config.tokenId,
    tokenSecret: config.tokenSecret,
    ...(config.environment ? { environment: config.environment } : {}),
  });
  let sandbox: Sandbox | undefined;

  try {
    const app = await modal.apps.fromName(config.appName, { createIfMissing: true });
    const image = modal.images
      .fromRegistry(config.image)
      .dockerfileCommands([
        "RUN mkdir -p /opt/kobi-runtime",
        "RUN cd /opt/kobi-runtime && npm init -y && npm install --ignore-scripts playwright@" + config.playwrightVersion,
      ]);

    sandbox = await modal.sandboxes.create(app, image, {
      blockNetwork: true,
      timeoutMs: config.timeoutMs,
      idleTimeoutMs: Math.min(config.timeoutMs, 20_000),
      cpu: config.cpu,
      cpuLimit: config.cpuLimit,
      memoryMiB: config.memoryMiB,
      memoryLimitMiB: config.memoryLimitMiB,
      workdir: "/opt/kobi-runtime",
      tags: { workload: "kobi-activity-verification" },
    });

    await sandbox.filesystem.writeText(
      JSON.stringify({
        bundleHtml: input.bundleHtml,
        manifest: input.manifest,
        timeoutMs: input.timeoutMs ?? 5_000,
      }),
      "/opt/kobi-runtime/input.json",
    );
    await sandbox.filesystem.writeText(
      buildModalRuntimeHarnessSource(),
      "/opt/kobi-runtime/verify.cjs",
    );

    const process = await sandbox.exec(["node", "/opt/kobi-runtime/verify.cjs"], {
      timeoutMs: Math.max(1_000, config.timeoutMs - 5_000),
      workdir: "/opt/kobi-runtime",
    });
    const stdoutPromise = process.stdout.readText();
    const stderrPromise = process.stderr.readText();
    const exitCode = await process.wait();
    const [stdout, stderr] = await Promise.all([stdoutPromise, stderrPromise]);

    if (exitCode !== 0) {
      throw new Error(
        `Modal verifier process exited ${exitCode}: ${truncateDiagnostic(stderr || stdout)}`,
      );
    }

    const parsed = modalHarnessResultSchema.safeParse(JSON.parse(stdout));
    if (!parsed.success) {
      throw new Error(`Modal verifier returned an invalid result: ${parsed.error.message}`);
    }
    if (!parsed.data.ok) {
      throw new Error(parsed.data.error ?? "isolated runtime verification failed");
    }

    return validateActivityRuntimeTraffic(parsed.data.messages);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const sandboxId = sandbox?.sandboxId ? ` sandbox=${sandbox.sandboxId}` : "";
    throw new Error(`Modal activity runtime verification failed:${sandboxId} ${message}`, {
      cause: error,
    });
  } finally {
    if (sandbox) {
      try {
        await sandbox.terminate({ wait: true });
      } catch {
        // The sandbox may already have reached its hard timeout.
      }
    }
    modal.close();
  }
}

export function buildModalRuntimeHarnessSource(): string {
  return `const __name = (target) => target;\n(${modalHarnessMain.toString()})()`;
}

function truncateDiagnostic(value: string, maxLength = 2_000): string {
  const normalized = value.trim();
  return normalized.length <= maxLength ? normalized : `${normalized.slice(0, maxLength)}...`;
}

function modalHarnessMain(): void {
  const fs = require("node:fs");
  const { chromium } = require("playwright");
  const input = JSON.parse(fs.readFileSync("/opt/kobi-runtime/input.json", "utf8"));
  const SDK_VERSION = "activity-sdk/v1";
  const smokeTitle = "Runtime injected title 4b26f9";
  const smokePrompt = "Runtime injected prompt 7c81da";
  const smokeAnswer = "runtime-injected-answer-2e95cb";
  const smokeHint = "Runtime injected hint 19d40a";
  const csp = [
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

  const runtimeManifest = {
    ...input.manifest,
    title: smokeTitle,
    content: {
      ...input.manifest.content,
      items: input.manifest.content.items.map((item: unknown, index: number) =>
        index === 0
          ? { ...(item as object), prompt: smokePrompt, answer_key: [smokeAnswer], hints: [smokeHint] }
          : item
      ),
    },
  };

  function inlineJson(value: unknown): string {
    return JSON.stringify(value)
      .replaceAll("<", "\\u003c")
      .replaceAll("\u2028", "\\u2028")
      .replaceAll("\u2029", "\\u2029");
  }

  function secureHtml(html: string): string {
    const cspMeta = `<meta http-equiv="Content-Security-Policy" content="${csp}">`;
    const doctype = html.match(/^\s*(?:<!--[\s\S]*?-->\s*)*<!doctype\b[^>]*>/i)?.[0];
    return doctype ? `${doctype}${cspMeta}${html.slice(doctype.length)}` : `${cspMeta}${html}`;
  }

  async function waitForMessage(page: any, type: string, method: string): Promise<void> {
    try {
      await page.waitForFunction(
        ({ expectedType, expectedMethod }: { expectedType: string; expectedMethod: string }) => {
          const raw = document.body.dataset.sdkMessages ?? "[]";
          const messages = JSON.parse(raw);
          return messages.some((message: any) =>
            message?.type === expectedType && message?.method === expectedMethod
          );
        },
        { expectedType: type, expectedMethod: method },
        { timeout: input.timeoutMs },
      );
    } catch (error) {
      throw new Error(`timed out waiting for SDK ${type} ${method}`, { cause: error });
    }
  }

  async function run(): Promise<void> {
    let browser: any;
    const runtimeErrors: string[] = [];
    try {
      browser = await chromium.launch({ headless: true });
      const page = await browser.newPage();
      page.on("pageerror", (error: Error) => runtimeErrors.push(`page error: ${error.message}`));
      page.on("console", (message: any) => {
        const text = message.text();
        if (
          message.type() === "error"
          && text !== "Unrecognized Content-Security-Policy directive 'navigate-to'."
        ) {
          runtimeErrors.push(`console error: ${text}`);
        }
      });

      await page.setContent(`<!doctype html><html><body data-sdk-messages="[]">
        <iframe id="activity-host" sandbox="allow-scripts" referrerpolicy="no-referrer"></iframe>
        <script>
          const messages = [];
          window.addEventListener("message", (event) => {
            if (event.source === window) return;
            const data = event.data;
            if (!data || data.sdk !== ${JSON.stringify(SDK_VERSION)}) return;
            messages.push(data);
            document.body.dataset.sdkMessages = JSON.stringify(messages);
            if (data.type !== "request") return;
            const result = data.method === "getManifest"
              ? ${inlineJson(runtimeManifest)}
              : ${inlineJson(runtimeManifest.difficulty_band)};
            event.source.postMessage({
              sdk: ${JSON.stringify(SDK_VERSION)},
              type: "response",
              id: data.id,
              ok: true,
              result,
            }, "*");
          });
        </script>
      </body></html>`);

      const iframe = page.locator("#activity-host");
      await iframe.evaluate((element: any, html: string) => { element.srcdoc = html; }, secureHtml(input.bundleHtml));
      const frame = page.frameLocator("#activity-host");
      await frame.locator("body").waitFor({ state: "attached", timeout: input.timeoutMs });
      await waitForMessage(page, "request", "getManifest");
      await waitForMessage(page, "request", "getBand");

      const actions = [
        ["attempt", '[data-smoke-action="attempt"], #attempt, .option', "reportAttempt"],
        ["hint", '[data-smoke-action="hint"], #hint', "reportHint"],
        ["complete", '[data-smoke-action="complete"], #complete', "reportComplete"],
      ];
      for (const [action, selector, eventMethod] of actions) {
        const control = frame.locator(selector).first();
        if (action === "complete") {
          await control.evaluate((element: any) => {
            if ("disabled" in element) element.disabled = false;
            element.removeAttribute("aria-disabled");
            element.style.pointerEvents = "auto";
          });
        }
        await control.click({ timeout: input.timeoutMs });
        await waitForMessage(page, "event", eventMethod);
      }

      if (runtimeErrors.length > 0) throw new Error(runtimeErrors.join("; "));
      const messages = JSON.parse(await page.locator("body").getAttribute("data-sdk-messages") || "[]");
      process.stdout.write(JSON.stringify({ ok: true, messages, error: null }));
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      process.stdout.write(JSON.stringify({
        ok: false,
        messages: [],
        error: `activity runtime verification failed: ${message}`,
      }));
    } finally {
      await browser?.close();
    }
  }

  void run();
}