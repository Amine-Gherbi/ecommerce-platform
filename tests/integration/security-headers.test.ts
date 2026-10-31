import { describe, expect, it } from "vitest";

import nextConfig from "../../next.config";

const EXPECTED: Record<string, string> = {
  "Strict-Transport-Security": "max-age=31536000; includeSubDomains",
  "X-Content-Type-Options": "nosniff",
  "X-Frame-Options": "DENY",
  "Referrer-Policy": "strict-origin-when-cross-origin",
  "Permissions-Policy": "camera=(), microphone=(), geolocation=()",
};

async function allRouteHeaders(): Promise<Map<string, string>> {
  const rules = await nextConfig.headers?.();
  const rule = rules?.find((entry) => entry.source === "/(.*)");
  expect(rule, "a header rule must cover every route").toBeDefined();
  return new Map(rule?.headers.map((header) => [header.key, header.value]));
}

describe("security headers", () => {
  it("declares all six headers for every route", async () => {
    const headers = await allRouteHeaders();

    for (const [name, value] of Object.entries(EXPECTED)) {
      expect(headers.get(name), name).toBe(value);
    }
  });

  it("sends a CSP that keeps Stripe.js, its frames and the Next runtime working", async () => {
    const policy = (await allRouteHeaders()).get("Content-Security-Policy");

    expect(policy).toBeDefined();
    expect(policy).toContain("default-src 'self'");
    expect(policy).toContain("script-src 'self' 'unsafe-inline' https://js.stripe.com");
    expect(policy).toContain("frame-src https://js.stripe.com https://hooks.stripe.com");
    expect(policy).toContain("connect-src 'self' https://api.stripe.com");
    expect(policy).toContain("frame-ancestors 'none'");
    expect(policy).toContain("object-src 'none'");
    // The app is served over HTTP in local development; an upgrade directive
    // would make those sessions unusable.
    expect(policy).not.toContain("upgrade-insecure-requests");
  });

  it("does not advertise the framework", () => {
    expect(nextConfig.poweredByHeader).toBe(false);
  });
});
