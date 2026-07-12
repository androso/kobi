import { describe, expect, it } from "vitest";
import {
  activityIframeCsp,
  activityIframeSecurityAttributes,
  secureActivitySrcDoc,
} from "./activityIframeSecurity";

describe("activity iframe security policy", () => {
  it("keeps the artifact in an opaque scripted sandbox with no referrer", () => {
    expect(activityIframeSecurityAttributes).toEqual({
      sandbox: "allow-scripts",
      referrerPolicy: "no-referrer",
    });
  });

  it("injects a restrictive CSP into the delivered document head", () => {
    const secured = secureActivitySrcDoc("<!doctype html><html><head></head><body></body></html>");

    expect(secured).toContain(`<head><meta http-equiv="Content-Security-Policy"`);
    expect(activityIframeCsp).toContain("default-src 'none'");
    expect(activityIframeCsp).toContain("connect-src 'none'");
    expect(activityIframeCsp).toContain("form-action 'none'");
    expect(activityIframeCsp).toContain("frame-src 'none'");
  });
});
