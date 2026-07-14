export const activityIframeCsp = [
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

export const activityIframeSecurityAttributes = {
  sandbox: "allow-scripts",
  referrerPolicy: "no-referrer",
} as const;

export function secureActivitySrcDoc(bundleHtml: string): string {
  const document = new DOMParser().parseFromString(bundleHtml, "text/html");
  const meta = document.createElement("meta");
  meta.httpEquiv = "Content-Security-Policy";
  meta.content = activityIframeCsp;
  document.head.prepend(meta);

  const doctype = document.doctype ? `<!doctype ${document.doctype.name}>` : "";
  return `${doctype}${document.documentElement.outerHTML}`;
}
