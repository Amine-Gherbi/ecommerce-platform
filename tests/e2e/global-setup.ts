import { execSync } from "node:child_process";

// The E2E server runs on shop_test, but Vitest has just finished with it. A
// deterministic reseed before the browser starts makes the specs independent of
// whatever the integration suites left behind.

const TEST_DATABASE_URL =
  process.env.TEST_DATABASE_URL ??
  "postgresql://postgres@localhost:5433/shop_test?schema=public";

export default function globalSetup(): void {
  const env = {
    ...process.env,
    DATABASE_URL: TEST_DATABASE_URL,
    TEST_DATABASE_URL,
  } as NodeJS.ProcessEnv;

  execSync("npx prisma migrate deploy", {
    cwd: process.cwd(),
    env,
    stdio: "inherit",
    timeout: 120_000,
  });
  execSync("npx prisma db seed -- --seed 42", {
    cwd: process.cwd(),
    env,
    stdio: "inherit",
    timeout: 180_000,
  });
}
