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
    // The integration suites share one database and one seed; running files in
    // parallel lets one file's TRUNCATE wipe another's fixtures mid-test.
    fileParallelism: false,
    coverage: {
      provider: "v8",
      // Domain logic plus the server actions that are the only write paths a
      // browser can reach. Both are held to the same floor.
      include: ["src/lib/**/*.ts", "src/app/**/actions.ts"],
      // The client factory has no logic of its own; everything else must stay
      // covered, with a floor of 70%.
      exclude: ["src/lib/db.ts"],
      reporter: ["text", "text-summary"],
      thresholds: {
        lines: 70,
        functions: 70,
        statements: 70,
      },
    },
  },
});
