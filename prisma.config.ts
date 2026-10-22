import { existsSync } from "node:fs";

import { defineConfig } from "prisma/config";

// Local development cluster: PostgreSQL 16 on 5433, trust auth, no password.
// The committed contract is `.env.example`; `.env` itself is gitignored.
const LOCAL_DEV_URL = "postgresql://postgres@localhost:5433/shop_dev?schema=public";

// Once a Prisma config file exists, the CLI stops loading `.env` on its own.
// Load it here so DATABASE_URL keeps its documented meaning, then fall back to
// the local URL only when no env file has been created yet (no credentials).
if (process.env.DATABASE_URL === undefined && existsSync(".env")) {
  process.loadEnvFile(".env");
}
process.env.DATABASE_URL ??= LOCAL_DEV_URL;

export default defineConfig({
  schema: "prisma/schema.prisma",
  datasource: { url: process.env.DATABASE_URL },
  migrations: { seed: "node --import tsx prisma/seed.ts" },
});
