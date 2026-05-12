import { expect, test } from "@playwright/test";

import { DEMO_EMAIL, DEMO_PASSWORD, signIn } from "./helpers";

const FIXED_HEADERS: Record<string, string> = {
  "strict-transport-security": "max-age=31536000; includeSubDomains",
  "x-content-type-options": "nosniff",
  "x-frame-options": "DENY",
  "referrer-policy": "strict-origin-when-cross-origin",
  "permissions-policy": "camera=(), microphone=(), geolocation=()",
};

// The five pages the audit scored. Checkout is reached signed-in with a cart,
// so the CSP is evaluated on the real form rather than the sign-in redirect.
const CSP_PAGES = ["/", "/p/technics-sl-120", "/cart", "/checkout", "/signin"];

test.describe("store quality gates", () => {
  test("every route carries the six security headers and no framework banner", async ({
    request,
    baseURL,
  }) => {
    for (const path of ["/", "/api/health", "/api/auth/providers"]) {
      const response = await request.get(path);
      expect(response.status(), path).toBe(200);

      for (const [name, value] of Object.entries(FIXED_HEADERS)) {
        expect(response.headers()[name], `${path} ${name}`).toBe(value);
      }

      const csp = response.headers()["content-security-policy"];
      expect(csp, `${path} Content-Security-Policy`).toBeDefined();
      expect(csp).toContain("default-src 'self'");
      expect(csp).toContain("script-src 'self' 'unsafe-inline' https://js.stripe.com");
      expect(csp).toContain("frame-src https://js.stripe.com https://hooks.stripe.com");
      expect(csp).toContain("frame-ancestors 'none'");
      expect(response.headers()["x-powered-by"], path).toBeUndefined();
    }

    // The auth route must describe the origin the browser used, not the
    // server's bind address. Next normalises a loopback host to "localhost",
    // so accept either spelling of the requested origin.
    const providers = await request.get("/api/auth/providers");
    const body = (await providers.json()) as {
      credentials: { signinUrl: string; callbackUrl: string };
    };
    const expectedOrigin = new URL(baseURL ?? "http://127.0.0.1:3100").origin;
    const allowedOrigins = new Set([
      expectedOrigin,
      expectedOrigin.replace("127.0.0.1", "localhost"),
    ]);
    expect([...allowedOrigins]).toContain(
      new URL(body.credentials.signinUrl).origin,
    );
    expect(new URL(body.credentials.signinUrl).pathname).toBe(
      "/api/auth/signin/credentials",
    );
    expect(new URL(body.credentials.callbackUrl).pathname).toBe(
      "/api/auth/callback/credentials",
    );
    expect(JSON.stringify(body)).not.toContain("0.0.0.0");
  });

  test("/favicon.ico answers with a real icon", async ({ request }) => {
    const response = await request.get("/favicon.ico");

    expect(response.status()).toBe(200);
    expect(response.headers()["content-type"]).toContain("image/x-icon");

    const bytes = await response.body();
    // ICONDIR: reserved = 0, type = 1 (icon), count > 0.
    expect(Array.from(bytes.subarray(0, 2))).toEqual([0, 0]);
    expect(Array.from(bytes.subarray(2, 4))).toEqual([1, 0]);
    expect(bytes.readUInt16LE(4)).toBeGreaterThan(0);
    expect(bytes.length).toBeGreaterThan(100);
  });

  test("the logo's accessible name contains its visible text", async ({
    page,
  }) => {
    await page.goto("/");

    const logo = page.locator('header a[href="/"]').first();
    await expect(logo).toHaveAccessibleName(/kestrel\s*audio/i);
    await expect(logo).not.toHaveAttribute("aria-label", /.+/);
  });

  test("each product page carries its own meta description", async ({ page }) => {
    for (const [slug, title, fragment] of [
      ["technics-sl-120", "Technics SL-120", "direct-drive turntable"],
      ["kef-ls50-wireless-ii", "KEF LS50 Wireless II", "powered bookshelf"],
    ] as const) {
      await page.goto(`/p/${slug}`);

      const description = await page
        .locator('meta[name="description"]')
        .getAttribute("content");

      expect(description, slug).toBeTruthy();
      expect(description).toContain(title);
      expect((description ?? "").toLowerCase()).toContain(fragment);
      expect(description).not.toContain("small hi-fi shop in Lyon");
    }
  });

  test("the audited pages load without CSP violations", async ({ page }) => {
    const violations: string[] = [];
    page.on("console", (message) => {
      if (
        message.type() === "error" &&
        /content security policy|refused to (load|execute|apply|connect|frame)/i.test(
          message.text(),
        )
      ) {
        violations.push(`${page.url()} :: ${message.text()}`);
      }
    });

    // Give checkout a real basket and a signed-in session.
    await page.goto("/signin");
    await signIn(page, DEMO_EMAIL, DEMO_PASSWORD, /\/account$/);
    await page.goto("/p/technics-sl-120");
    await page.getByRole("button", { name: "Add to cart" }).click();
    await expect(page.getByText("Added to cart.")).toBeVisible();

    for (const path of CSP_PAGES) {
      const response = await page.goto(path);
      expect(response?.status(), path).toBeLessThan(400);
      await page.waitForLoadState("networkidle");
      if (path === "/checkout") {
        await expect(page).toHaveURL(/\/checkout$/);
      }
    }

    expect(violations).toEqual([]);
  });
});
