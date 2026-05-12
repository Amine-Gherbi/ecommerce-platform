// Visits the five audited store pages in a real browser and fails if any
// Content Security Policy violation reaches the console. Run it against the
// production build so the policy under test is the one that ships:
//
//   npm run build
//   DATABASE_URL=... AUTH_SECRET=... PORT=3200 node .next/standalone/server.js
//   node scripts/check-csp.mjs http://127.0.0.1:3200
import { chromium } from "@playwright/test";

const baseUrl = process.argv[2] ?? "http://127.0.0.1:3200";

const browser = await chromium.launch();
try {
  const page = await browser.newPage();
  const violations = [];
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

  // Checkout redirects anonymous visitors to sign-in, so reach it the way a
  // customer does: sign in, add a product, then open the form.
  await page.goto(`${baseUrl}/signin`, { waitUntil: "networkidle" });
  await page.getByLabel("Email", { exact: true }).fill("demo@kestrel.test");
  await page.getByLabel("Password", { exact: true }).fill("demo-password-123");
  await page.getByRole("button", { name: "Sign in" }).click();
  await page.waitForURL(/\/account$/);

  await page.goto(`${baseUrl}/p/technics-sl-120`, { waitUntil: "networkidle" });
  await page.getByRole("button", { name: "Add to cart" }).click();
  await page.getByText("Added to cart.").waitFor();

  for (const path of ["/", "/p/technics-sl-120", "/cart", "/checkout", "/signin"]) {
    const response = await page.goto(`${baseUrl}${path}`, {
      waitUntil: "networkidle",
    });
    const status = response?.status() ?? 0;
    console.log(`${status} ${path}`);
    if (status >= 400) {
      violations.push(`${path} :: HTTP ${status}`);
    }
    if (path === "/checkout" && !page.url().endsWith("/checkout")) {
      violations.push("/checkout redirected to /signin");
    }
  }

  const providers = await fetch(`${baseUrl}/api/auth/providers`);
  const body = await providers.text();
  console.log(`${providers.status} /api/auth/providers ${body}`);
  if (body.includes("0.0.0.0")) {
    violations.push("/api/auth/providers reports the bind address");
  }

  await browser.close();

  if (violations.length > 0) {
    console.error("FAILED");
    for (const violation of violations) console.error(`- ${violation}`);
    process.exitCode = 1;
  } else {
    console.log("OK: no CSP violations on the five audited pages");
  }
} catch (error) {
  await browser.close();
  throw error;
}
