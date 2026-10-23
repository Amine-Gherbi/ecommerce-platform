# Proof map

Every claim has a command. Everything here was run on this machine (Windows 11,
Node 22.23.4, PostgreSQL 16.13) on 2026-10-23 unless labelled otherwise.

## Gate

```bash
npm run verify
```

`eslint . && tsc --noEmit && vitest run --coverage && prisma migrate diff … --exit-code && playwright test`

Exit 0. CI has never run (no remote); [`docs/PIPELINE.md`](PIPELINE.md) says so.

## Invariants → tests

| Claim | Test |
| --- | --- |
| A forged price cannot change the charge | `tests/integration/checkout.forged-price.test.ts` |
| One order per `(userId, idempotencyKey)` under double submit | `tests/integration/checkout.double-submit.test.ts` |
| 20 concurrent checkouts on stock 5 create exactly 5 orders | `tests/integration/checkout.oversell.test.ts` |
| Expired reservations release stock and cancel the order | `tests/integration/stock.sweeper.test.ts` |
| A replayed webhook is a 200 no-op | `tests/integration/webhook.replay.test.ts` |
| Illegal transitions log and return 200 | `tests/integration/webhook.transitions.test.ts` |
| Amount mismatch becomes `REFUND_REQUIRED`, never `PAID` | `tests/integration/checkout.amount-mismatch.test.ts` |
| A dropped webhook is settled by reconciliation | `tests/integration/reconcile.dropped-webhook.test.ts` |
| Rate limiting returns 429 | `tests/integration/security.rate-limit.test.ts` |
| Browser happy path + forged-price path | `tests/e2e/checkout.spec.ts` |

## Measurements

- **Concurrency:** `npx vitest run tests/integration/checkout.oversell.test.ts --reporter=verbose`
  → `20 concurrent checkouts on stock 5 → 5×201, 15×409, stock=0, openReservations=5`.
  Transcript: [`docs/proof/concurrency-run.txt`](proof/concurrency-run.txt).
- **Checkout load:** `node scripts/load-fixture.mjs && k6 run load/checkout.js`
  → 50 VUs, 250 checkouts, 0 % errors, p50 1.96 s, p95 2.66 s, p99 2.88 s.
  Method, hardware, reduced duration and limits: [`docs/load/checkout.md`](load/checkout.md).

Test counts are not metrics and are deliberately not quoted.

## Assets

`npm run assets` writes `P:/portfolio/_shared/assets/ecommerce-platform/`:
four 2880×1800 WebP shots (hero = concurrency terminal beside the checkout page)
and `manifest.json` with `proof{}`. The database is reseeded `--seed 42` before
capture; `generatedAt` comes from the last commit, so reruns are stable.
