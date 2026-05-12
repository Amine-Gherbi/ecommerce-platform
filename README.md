# ecommerce-platform

**Case study:** https://gherbi.pages.dev/projects/ecommerce-platform/ — the store is deployed at <https://kestrel-store.onrender.com>; see *Run* for local development.

A Next.js 15 / PostgreSQL 16 storefront. Its hard problem is money correctness under concurrency.

**Hard problem:** 20 concurrent checkouts against stock 5 must create exactly 5 orders at the server-recomputed total, and no reserved unit may leak (`tests/integration/checkout.oversell.test.ts`).

**Demo credentials:** customer `demo@kestrel.test` / `demo-password-123`; admin `admin@kestrel.test` / `admin-password-123` (seeded with `--seed 42`).

**Run** (Node 22 + PostgreSQL 16 on port 5433; copy `.env.example` to `.env` and seed with `npx prisma db seed -- --seed 42` first):

```bash
npm run dev
npm run verify
```
Numbers: [`docs/load/checkout.md`](docs/load/checkout.md) and [`docs/PROOF.md`](docs/PROOF.md).

## Stack

Next.js 15 App Router (RSC) · TypeScript strict · Tailwind 4 + shadcn primitives · PostgreSQL 16 + Prisma 6 · Auth.js v5 (JWT) · Stripe sandbox · Vitest · Playwright · k6. The server creates every PaymentIntent from its own totals; the browser collects the card with the Payment Element and the webhook verifies Stripe's signature with the SDK. Running at <https://kestrel-store.onrender.com> against Neon; the sandbox card `4242 4242 4242 4242` completes a checkout end to end.

## What is proved

| Claim | Where |
| --- | --- |
| A forged price in the checkout body is ignored | `tests/integration/checkout.forged-price.test.ts` |
| Concurrent double submit creates one order and returns it to the loser | `tests/integration/checkout.double-submit.test.ts` |
| 20 concurrent checkouts on stock 5 create exactly 5 orders | `tests/integration/checkout.oversell.test.ts` |
| An expired reservation cancels the order and restores stock once | `tests/integration/reservations.sweeper.test.ts` |
| A replayed webhook is a 200 no-op | `tests/integration/webhook.replay.test.ts` |
| An illegal transition is a 200 with a log, never a downgrade | `tests/integration/webhook.transitions.test.ts` |
| An amount or currency mismatch becomes `REFUND_REQUIRED`, never `PAID` | `tests/integration/checkout.amount-mismatch.test.ts` |
| Checkout creates the PaymentIntent from the server total and stores its real `pi_…` id | `tests/integration/checkout.payment-intent.test.ts` |
| The webhook verifies Stripe's signature with the SDK before touching order state | `tests/integration/webhook.transitions.test.ts` |
| A product edit or archive does not rewrite order history | `tests/integration/admin.products.test.ts` |
| Browser checkout renders the server total and creates the order at it | `tests/e2e/checkout.spec.ts` |

## Load measurement

`k6 run load/checkout.js` on 2026-10-23: 50 VUs × 5 iterations = 250 checkouts against `next start`, **p95 4.58 s**, **248/250 created**, 750 HTTP requests. The two failures were `P2028` transaction-start timeouts under the default Prisma pool; the database held 248 orders, 248 open reservations and stock 99,752, so neither failure left a partial row. Method, hardware, raw summary and limits: [`docs/load/checkout.md`](docs/load/checkout.md).

`npm run verify` exited 0 on the same machine: ESLint, `tsc --noEmit`, 33 Vitest files / 181 tests with 92.54 % statement coverage, migration drift clean, 5 Playwright tests. The same command runs on GitHub Actions: `ci.yml` is green on `master` (run [40081391256](https://github.com/Amine-Gherbi/ecommerce-platform/actions/runs/40081391256), 2026-10-24, 2 m 28 s). The first two runs failed — `psql` rejected Prisma's `?schema=public`, then Vitest found an empty `shop_test` — and both causes are fixed in the workflow.

## Documentation

- [`docs/PROOF.md`](docs/PROOF.md) — README claim → test or command
- [`docs/INVARIANTS.md`](docs/INVARIANTS.md) — each invariant and the test that holds it
- [`docs/INTERVIEW.md`](docs/INTERVIEW.md) — 20 questions, answered with `file:line`
- [`docs/DEPLOY.md`](docs/DEPLOY.md) — Node-host build, env, migrations, seed, verify
- [`docs/OPERATIONS.md`](docs/OPERATIONS.md) — reservation sweeper, webhook replay, what does not exist
- [`docs/PIPELINE.md`](docs/PIPELINE.md) — the CI definition and why it is unexecuted
- [`docs/adr/`](docs/adr/) — decisions and their costs
