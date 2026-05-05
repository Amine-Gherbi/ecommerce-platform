import { execSync } from "node:child_process";

// E2E runs against `shop_test`, the same database Vitest just used. Resetting
// the schema and reseeding before the browser starts makes every run begin from
// the deterministic `--seed 42` catalogue, independent of the integration
// suites' fixtures.
//
// `shop_test` is built with `prisma db push` rather than `migrate deploy`: it
// carries no committed migration history. `db push` only reconciles the schema
// (no reset); the seed below truncates every table, which is the reset.
const TEST_DATABASE_URL =
  process.env.TEST_DATABASE_URL ??
  "postgresql://postgres@localhost:5433/shop_test?schema=public";

export default function globalSetup(): void {
  const env = {
    ...process.env,
    DATABASE_URL: TEST_DATABASE_URL,
    TEST_DATABASE_URL,
  } as NodeJS.ProcessEnv;

  const run = (command: string, timeout: number): void => {
    execSync(command, {
      cwd: process.cwd(),
      env,
      stdio: "inherit",
      timeout,
    });
  };

  run("npx prisma db push --skip-generate", 180_000);
  run("npx prisma db seed -- --seed 42", 180_000);
}
