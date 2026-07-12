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
  const csp = `<meta http-equiv="Content-Security-Policy" content="${activityIframeCsp}">`;
  if (/<head(?:\s[^>]*)?>/i.test(bundleHtml)) {
    return bundleHtml.replace(/<head(?:\s[^>]*)?>/i, (head) => `${head}${csp}`);
  }
  return `${csp}${bundleHtml}`;
}
