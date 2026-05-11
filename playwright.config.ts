import { defineConfig, devices } from "@playwright/test";

// E2E runs against its own dev server on 3100 and its own database
// (`shop_test`), never the 3000 server an operator may have open on `shop_dev`.
// `reuseExistingServer: false` is deliberate: reusing a server started with a
// different DATABASE_URL would silently run the specs against demo data.
const TEST_DATABASE_URL =
  process.env.TEST_DATABASE_URL ??
  "postgresql://postgres@localhost:5433/shop_test?schema=public";
const PORT = Number(process.env.E2E_PORT ?? "3100");
const MOCK_STRIPE_PORT = Number(process.env.MOCK_STRIPE_PORT ?? "12111");
const BASE_URL = `http://127.0.0.1:${PORT}`;
const MOCK_STRIPE_URL = `http://127.0.0.1:${MOCK_STRIPE_PORT}`;

export default defineConfig({
  testDir: "tests/e2e",
  fullyParallel: false,
  workers: 1,
  retries: process.env.CI ? 1 : 0,
  timeout: 60_000,
  expect: { timeout: 10_000 },
  globalSetup: "./tests/e2e/global-setup.ts",
  reporter: process.env.CI ? [["github"], ["line"]] : [["list"]],
  use: {
    baseURL: BASE_URL,
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    ...devices["Desktop Chrome"],
  },
  webServer: [
    {
      // The browser suite never calls api.stripe.com. The mock answers the one
      // PaymentIntent create call; the checkout transaction and database are
      // the real ones.
      command: "node tests/e2e/mock-stripe.mjs",
      url: `${MOCK_STRIPE_URL}/health`,
      reuseExistingServer: false,
      timeout: 30_000,
      env: { MOCK_STRIPE_PORT: String(MOCK_STRIPE_PORT) },
    },
    {
      command: `npx next dev -p ${PORT}`,
      url: BASE_URL,
      reuseExistingServer: false,
      timeout: 180_000,
      env: {
        DATABASE_URL: TEST_DATABASE_URL,
        AUTH_SECRET: "p2-e2e-secret-not-for-production",
        NODE_ENV: "development",
        STRIPE_SECRET_KEY: "sk_test_e2e_mock",
        STRIPE_API_HOST: MOCK_STRIPE_URL,
        // No publishable key: Stripe.js is not loaded from the network, so the
        // spec stops at the order-created state and follows the order link.
        NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY: "",
      },
    },
  ],
});
