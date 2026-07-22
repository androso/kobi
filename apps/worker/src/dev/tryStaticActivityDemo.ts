import { mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  buildActivitySessionContext,
  createActivityArtifactCandidates,
  verifyActivityArtifact,
} from "@kobi/activities/server";
import { createActivitySetId } from "../activity-generation/openaiArtifactGenerator.js";
import { verifyActivityRuntime } from "../activity-generation/runtimeVerifier.js";
import { staticActivityContext } from "./staticActivityContext.js";

function safeInlineJson(value: unknown): string {
  return JSON.stringify(value)
    .replaceAll("<", "\\u003c")
    .replaceAll("\u2028", "\\u2028")
    .replaceAll("\u2029", "\\u2029");
}

const sessionContext = buildActivitySessionContext([staticActivityContext.lessonState]);
const candidates = createActivityArtifactCandidates({
  lessonState: staticActivityContext.lessonState,
  sessionContext,
  curriculumMatches: staticActivityContext.curriculumMatches,
  activitySetId: createActivitySetId(),
});

async function main() {
  const core = candidates.find((candidate) => candidate.manifest.difficulty_band === "core");
  if (!core) {
    throw new Error("missing core candidate");
  }
  const staticResult = verifyActivityArtifact(core);
  console.log("static verification:", staticResult.ok, staticResult.errors);

  const runtimeResult = await verifyActivityRuntime({
    bundleHtml: core.bundle_html,
    manifest: core.manifest,
    timeoutMs: 10_000,
  });
  console.log("runtime verification:", runtimeResult);

  const outDir = resolve(process.cwd(), "../../local/activity-demo");
  mkdirSync(outDir, { recursive: true });

  writeFileSync(resolve(outDir, "bundle.html"), core.bundle_html, "utf8");

  const manifestJson = safeInlineJson(core.manifest);
  const bandJson = safeInlineJson(core.manifest.difficulty_band);

  const hostHtml = `<!doctype html>
<html lang="es">
<head>
  <meta charset="utf-8">
  <title>Kobi activity demo</title>
  <style>
    body { font-family: system-ui, sans-serif; margin: 0; background: #eff6ff; color: #0f172a; }
    main { padding: 24px; max-width: 960px; margin: 0 auto; }
    #frame { width: 100%; height: 720px; border: 0; border-radius: 16px; box-shadow: 0 12px 40px rgba(30, 64, 175, 0.2); background: white; }
    #status { font-weight: 600; }
  </style>
</head>
<body>
  <main>
    <h1>Manifest-driven activity demo</h1>
    <p id="status">Loading secured iframe…</p>
    <iframe id="frame" sandbox="allow-scripts" referrerpolicy="no-referrer"></iframe>
  </main>
  <script>
    const manifest = ${manifestJson};
    const band = ${bandJson};
    const frame = document.getElementById("frame");
    window.addEventListener("message", (event) => {
      if (event.source === window) return;
      const data = event.data;
      if (!data || data.sdk !== "activity-sdk/v1" || data.type !== "request") return;
      const result = data.method === "getManifest" ? manifest : band;
      event.source.postMessage(
        { sdk: "activity-sdk/v1", type: "response", id: data.id, ok: true, result },
        "*",
      );
      document.getElementById("status").textContent = "SDK request: " + data.method;
    });
    fetch("./bundle.html")
      .then((response) => response.text())
      .then((bundleHtml) => {
        const csp = "default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; img-src data:; connect-src 'none'; font-src 'none'; frame-src 'none'; object-src 'none'; base-uri 'none'; form-action 'none'";
        frame.srcdoc = bundleHtml.replace(/<!doctype[^>]*>/i, (match) =>
          match + '<meta http-equiv="Content-Security-Policy" content="' + csp + '">'
        );
      })
      .catch((error) => {
        document.getElementById("status").textContent = "Demo failed: " + error.message;
      });
  </script>
</body>
</html>`;

  const hostPath = resolve(outDir, "index.html");
  writeFileSync(hostPath, hostHtml, "utf8");
  console.log("demo page:", hostPath);
}

void main();
