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
    const parsed = new DOMParser().parseFromString(secured, "text/html");

    expect(secured).toMatch(/^<!doctype html><meta http-equiv="Content-Security-Policy"/i);
    expect(parsed.compatMode).toBe("CSS1Compat");
    expect(parsed.head.querySelector('meta[http-equiv="Content-Security-Policy"]')).not.toBeNull();
    expect(activityIframeCsp).toContain("default-src 'none'");
    expect(activityIframeCsp).toContain("connect-src 'none'");
    expect(activityIframeCsp).toContain("form-action 'none'");
    expect(activityIframeCsp).toContain("frame-src 'none'");
  });

  it("injects CSP into the parsed head when a script string contains head markup", () => {
    const secured = secureActivitySrcDoc(`<!doctype html>
      <html>
        <head><title>Actividad</title></head>
        <body><script>const example = "<head>";</script></body>
      </html>`);
    const parsed = new DOMParser().parseFromString(secured, "text/html");

    expect(parsed.head.querySelector('meta[http-equiv="Content-Security-Policy"]')).not.toBeNull();
    expect(parsed.head.querySelector("title")?.textContent).toBe("Actividad");
    expect(parsed.body.textContent).toContain('<head>');
  });

  it("keeps CSP after a doctype that follows leading comments", () => {
    const secured = secureActivitySrcDoc(
      '<!-- generated --><!doctype html><html><head></head><body></body></html>',
    );
    const parsed = new DOMParser().parseFromString(secured, "text/html");

    expect(secured).toMatch(
      /^<!-- generated --><!doctype html><meta http-equiv="Content-Security-Policy"/i,
    );
    expect(parsed.compatMode).toBe("CSS1Compat");
    expect(parsed.head.querySelector('meta[http-equiv="Content-Security-Policy"]')).not.toBeNull();
  });

  it("does not parse untrusted resources in the parent document", () => {
    const bundle = '<!doctype html><html><head></head><body><img src="https://evil.test/pixel"></body></html>';
    const secured = secureActivitySrcDoc(bundle);

    expect(secured).toBe(
      `<!doctype html><meta http-equiv="Content-Security-Policy" content="${activityIframeCsp}"><html><head></head><body><img src="https://evil.test/pixel"></body></html>`,
    );
  });
});
