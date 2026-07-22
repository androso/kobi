import {
  ACTIVITY_SDK_VERSION,
  type ActivityManifest,
} from "@kobi/activities/server";
import { describe, expect, it } from "vitest";
import { verifyActivityRuntime } from "./runtimeVerifier.js";

const manifest: ActivityManifest = {
  family: "guided_practice",
  mechanic: "source_check_desk",
  title: "Manifest-owned newspaper activity",
  difficulty_band: "core",
  curriculum: {
    grade: 7,
    subject: "lenguaje",
    unit: "U4",
    objective: "L7.4.2",
  },
  est_minutes: 6,
  content: {
    items: [{
      prompt: "Identify the strongest source.",
      answer_key: ["Unique editable answer 8a61"],
      hints: ["Unique editable hint 39cb"],
    }],
  },
  entry: "index.html",
  sdk_version: ACTIVITY_SDK_VERSION,
  allowed_capabilities: ["dom", "css"],
  learning_design: {
    learning_goal: "Identify a supported source.",
    interaction_summary: "Review source evidence.",
    success_criteria: ["Selects a source."],
  },
  visual_theme: { scene: "news desk", accent: "blue" },
};

const validBundle = `<!doctype html><html><body><main id="app"></main><script>
const SDK = "activity-sdk/v1";
let receivedManifest;
let receivedBand;
function sendRequest(id, method) { parent.postMessage({ sdk: SDK, type: "request", id, method }, "*"); }
function render() {
  if (!receivedManifest || !receivedBand) return;
  document.getElementById("app").innerHTML = '<h1 id="title"></h1><p id="prompt"></p><button class="option">Choose</button><button id="hint">Hint</button><button id="complete">Complete</button>';
  document.getElementById("title").textContent = receivedManifest.title;
  document.getElementById("prompt").textContent = receivedManifest.content.items[0].prompt;
  document.querySelector(".option").addEventListener("click", () => parent.postMessage({ sdk: SDK, type: "event", method: "reportAttempt", payload: { item_index: 0, correct: true } }, "*"));
  document.getElementById("hint").addEventListener("click", () => parent.postMessage({ sdk: SDK, type: "event", method: "reportHint", payload: { item_index: 0, hint_index: 0 } }, "*"));
  document.getElementById("complete").addEventListener("click", () => parent.postMessage({ sdk: SDK, type: "event", method: "reportComplete", payload: { score_unit: "count", score: 1, total: 1 } }, "*"));
}
addEventListener("message", (event) => {
  if (event.data?.type !== "response") return;
  if (event.data.id === "manifest") receivedManifest = event.data.result;
  if (event.data.id === "band") receivedBand = event.data.result;
  render();
});
sendRequest("manifest", "getManifest");
sendRequest("band", "getBand");
</script></body></html>`;

const supportsBrowserLaunch = process.env.SKIP_BROWSER_TESTS !== "true" && process.platform !== "win32";

describe("activity runtime verifier static checks", () => {
  it("rejects editable answers or hints embedded in source", async () => {
    const embedded = validBundle.replace("<main id=\"app\"></main>", `<main id="app">${manifest.content.items[0]?.answer_key[0]}</main>`);
    await expect(
      verifyActivityRuntime({ bundleHtml: embedded, manifest }),
    ).rejects.toThrow(/embeds editable answer or hint content/i);
  });
});

describe.runIf(supportsBrowserLaunch)("activity runtime verifier browser smoke", () => {
  it("passes a manifest-owned bundle with runnable SDK controls", async () => {
    await expect(verifyActivityRuntime({ bundleHtml: validBundle, manifest })).resolves.toEqual({
      requests: ["getManifest", "getBand"],
      events: ["reportAttempt", "reportHint", "reportComplete"],
    });
  }, 30_000);

  it("rejects JavaScript syntax errors", async () => {
    const syntaxError = validBundle.replace("let receivedManifest;", "let receivedManifest = ;");
    await expect(
      verifyActivityRuntime({ bundleHtml: syntaxError, manifest, timeoutMs: 1_500 }),
    ).rejects.toThrow(/SDK request getManifest.*page error.*Unexpected token/is);
  }, 30_000);

  it("rejects no-op SDK hook strings", async () => {
    const noOp = '<!doctype html><body><h1>getManifest getBand reportAttempt reportHint reportComplete</h1></body>';
    await expect(
      verifyActivityRuntime({ bundleHtml: noOp, manifest, timeoutMs: 1_500 }),
    ).rejects.toThrow(/SDK request getManifest/i);
  }, 30_000);

  it("rejects a bundle that never requests the manifest", async () => {
    const withoutManifestRequest = validBundle.replace('sendRequest("manifest", "getManifest");', "");
    await expect(
      verifyActivityRuntime({ bundleHtml: withoutManifestRequest, manifest, timeoutMs: 1_500 }),
    ).rejects.toThrow(/SDK request getManifest/i);
  }, 30_000);

  it("rejects artifact console errors", async () => {
    const consoleError = validBundle.replace(
      'const SDK = "activity-sdk/v1";',
      'const SDK = "activity-sdk/v1"; console.error("runtime smoke console failure");',
    );
    await expect(
      verifyActivityRuntime({ bundleHtml: consoleError, manifest }),
    ).rejects.toThrow(/console error: runtime smoke console failure/i);
  }, 30_000);

  it("rejects controls that cannot execute the smoke interaction", async () => {
    const disabled = validBundle
      .replace('<button class="option">', '<button class="option" disabled>')
      .replace('<button id="hint">', '<button id="hint" disabled>')
      .replace('<button id="complete">', '<button id="complete" disabled>');
    await expect(
      verifyActivityRuntime({ bundleHtml: disabled, manifest, timeoutMs: 1_500 }),
    ).rejects.toThrow(/non-runnable attempt smoke control/i);
  }, 30_000);
});
