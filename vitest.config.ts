import { fileURLToPath } from "node:url";

import { defineConfig } from "vitest/config";

export default defineConfig({
  esbuild: {
    jsx: "automatic",
  },
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
    },
  },
  test: {
    environment: "node",
    include: ["src/**/*.test.{ts,tsx}", "tests/**/*.test.{ts,tsx}"],
    // Point the app's Prisma client at shop_test before any test module loads.
    setupFiles: ["tests/setup-env.ts"],
    passWithNoTests: true,
    testTimeout: 60_000,
    hookTimeout: 120_000,
  },
});
