import { defineConfig, devices } from "@playwright/test";

// E2E runs against its own dev server on 3100 and its own database
// (`shop_test`), never the 3000 server an operator may have open on `shop_dev`.
// `reuseExistingServer: false` is deliberate: reusing a server started with a
// different DATABASE_URL would silently run the specs against demo data.
const TEST_DATABASE_URL =
  process.env.TEST_DATABASE_URL ??
  "postgresql://postgres@localhost:5433/shop_test?schema=public";
const PORT = Number(process.env.E2E_PORT ?? "3100");
const BASE_URL = `http://127.0.0.1:${PORT}`;

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
  webServer: {
    command: `npx next dev -p ${PORT}`,
    url: BASE_URL,
    reuseExistingServer: false,
    timeout: 180_000,
    env: {
      DATABASE_URL: TEST_DATABASE_URL,
      AUTH_SECRET: "p2-e2e-secret-not-for-production",
      NODE_ENV: "development",
    },
  },
});
