/** @vitest-environment jsdom */
import { describe, expect, it } from "vitest";
import {
  isActivitySdkRequestFromIframe,
  markActivityIframeAwaitingSource,
  respondToActivitySdkRequest,
} from "./activitySdkHost";

describe("activitySdkHost", () => {
  it("responds to SDK requests from opaque sandboxed iframes", () => {
    const iframe = document.createElement("iframe");
    iframe.setAttribute("sandbox", "allow-scripts");
    iframe.setAttribute("srcdoc", "<!doctype html><title>bundle</title>");
    document.body.appendChild(iframe);
    markActivityIframeAwaitingSource(iframe);

    const responses: unknown[] = [];
    const foreignSource = {
      postMessage: (message: unknown) => {
        responses.push(message);
      },
    } as Window;

    const event = new MessageEvent("message", {
      data: { sdk: "activity-sdk/v1", type: "request", id: "manifest-1", method: "getManifest" },
      source: foreignSource,
      origin: "null",
    });

    expect(isActivitySdkRequestFromIframe(event, iframe)).toBe(true);

    const handled = respondToActivitySdkRequest(event, {
      iframe,
      manifest: {
        family: "guided_practice",
        mechanic: "source_check_desk",
        title: "Runtime title",
        difficulty_band: "core",
        curriculum: { grade: 7, subject: "lenguaje", unit: "U4", objective: "L7.4.2" },
        est_minutes: 6,
        content: {
          items: [{ prompt: "Prompt", answer_key: ["a"], hints: ["hint"] }],
          telemetry_events: ["attempt", "hint", "complete"],
        },
        entry: "index.html",
        sdk_version: "activity-sdk/v1",
        allowed_capabilities: ["dom", "css"],
        learning_design: { learning_goal: "goal", interaction_summary: "summary", success_criteria: ["ok"] },
      },
      band: "core",
    });

    expect(handled).toBe(true);
    expect(responses).toEqual([
      {
        sdk: "activity-sdk/v1",
        type: "response",
        id: "manifest-1",
        ok: true,
        result: expect.objectContaining({ title: "Runtime title" }),
      },
    ]);

    iframe.remove();
  });
});
