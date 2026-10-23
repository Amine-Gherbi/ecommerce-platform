# ecommerce-platform

**What it is:** a Next.js 15 / PostgreSQL storefront built around money correctness — server-recomputed totals, one order per checkout attempt, reserved stock, idempotent Stripe webhooks, and reconciliation for the webhook that never arrives.

**Hardest problem:** making concurrency and failure paths true, not asserted: 20 concurrent checkouts on stock 5 must create exactly 5 orders, a replayed webhook must be a 200 no-op, and a lost webhook must still settle.

**Live URL:** none — **local only** (`npm run dev` → `http://localhost:3000`). There is no git remote, so `.github/workflows/ci.yml` has never run; see [docs/PIPELINE.md](docs/PIPELINE.md).

**Demo credentials:** customer `demo@alder.test` / `demo-password-123` · admin `admin@alder.test` / `admin-password-123` (seeded with `--seed 42`).

**Proof:** [docs/PROOF.md](docs/PROOF.md) — every claim with the command or test that reproduces it; load method and numbers in [docs/load/checkout.md](docs/load/checkout.md).

**Test status:** `npm run verify` exits 0 locally (lint, strict types, Vitest + coverage, migration drift, 2 Playwright E2E specs). CI is defined but unexecuted, so no green badge is claimed.

## Stack

Next.js 15 App Router · TypeScript strict · Tailwind 4 + shadcn primitives · PostgreSQL 16 + Prisma 6 · Auth.js v5 (JWT) · Stripe test mode · Vitest · Playwright · k6.

## Run it

Requires Node 22 and a local PostgreSQL 16 cluster on port 5433 (`shop_dev`, `shop_test`).

```bash
cp .env.example .env
npm ci
npx prisma migrate deploy
npx prisma db seed -- --seed 42
npm run dev
```

`npm run verify` runs the full gate; Playwright needs `npx playwright install chromium` once per machine.

## The correctness claims

| Threat | Where it is proved |
| --- | --- |
| A forged price in the checkout body | `tests/integration/checkout.forged-price.test.ts`, `tests/e2e/checkout.spec.ts` |
| Concurrent double submit | `tests/integration/checkout.double-submit.test.ts` |
| Oversell: 20 buyers, stock 5 | `tests/integration/checkout.oversell.test.ts` |
| Abandoned checkout leaks stock | `tests/integration/stock.sweeper.test.ts` |
| Webhook replay / out-of-order events | `tests/integration/webhook.replay.test.ts`, `webhook.transitions.test.ts` |
| Amount mismatch | `tests/integration/checkout.amount-mismatch.test.ts` |
| Webhook never arrives | `tests/integration/reconcile.dropped-webhook.test.ts` |
| Card testing / credential stuffing | `tests/integration/security.rate-limit.test.ts` |

The load report is a real k6 run from this machine (50 VUs, 250 checkouts, 0 % errors); the method, hardware and reduced duration are stated in [docs/load/checkout.md](docs/load/checkout.md).

## Documentation

- [`docs/PROOF.md`](docs/PROOF.md) — claim → command/test
- [`docs/PIPELINE.md`](docs/PIPELINE.md) — what CI would run, and that it never has
- [`docs/INVARIANTS.md`](docs/INVARIANTS.md) — rules that must never break
- [`docs/OPERATIONS.md`](docs/OPERATIONS.md) — sweeper, reconciliation, refunds
- [`docs/WHY-THIS-INDEX.md`](docs/WHY-THIS-INDEX.md) — measured query plans
- [`docs/adr/`](docs/adr/) — decisions and their costs
