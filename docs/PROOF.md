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
| Expired reservations release stock and cancel the order | `tests/integration/reservations.sweeper.test.ts` |
| A replayed webhook is a 200 no-op | `tests/integration/webhook.replay.test.ts` |
| Illegal transitions log and return 200 | `tests/integration/webhook.transitions.test.ts` |
| Amount mismatch becomes `REFUND_REQUIRED`, never `PAID` | `tests/integration/checkout.amount-mismatch.test.ts` |
| A dropped webhook is settled by reconciliation | `tests/integration/reconcile.dropped-webhook.test.ts` |
| Rate limiting returns 429 | `tests/integration/security.rate-limit.test.ts` |
| Browser happy path + forged-price path | `tests/e2e/checkout.spec.ts` |

## Checkout round (P2-R4)

Run on 2026-10-23 against a production server (`next start -p 3200`) pointed at
`shop_test_checkout`. The scripts take `DATABASE_URL` from the environment, so it
must name the same database the server uses.

```bash
node scripts/checkout-double-submit.mjs
node scripts/checkout-oversell.mjs
node scripts/webhook-proof.mjs
npx vitest run   # with TEST_DATABASE_URL=…/shop_test_checkout
```

Observed:

- Forged `totalCents: 1` ignored: order `KST-2610-DCAB369A` stored
  `2490 + 490 = 2980`, and psql recomputed the same subtotal from
  `Variant.priceCents`.
- Two parallel `curl` submits of one cart version: HTTP 201 + 200, the same
  order number, and `count(*) WHERE idempotencyKey = sha256(cart.id:cartVersion)`
  = 1.
- 20 concurrent HTTP checkouts on stock 5: `5×201`, `15×409 OUT_OF_STOCK`,
  `stock=0`, 5 orders, 5 open reservations.
- Correct signed webhook → `PAID`; replay → 200 `duplicate` with one
  `WebhookEvent` row; amount +1 → `REFUND_REQUIRED`, `paidAt` null, stock
  restored; unsigned and wrongly signed → 400 with no event row.
- Sweeper test: an expired reservation cancels the order and restores stock
  once; a `PAID` order with a stale reservation is left alone.
- `npx tsc --noEmit`, `npx eslint .`, `npm run build`: exit 0.
- `vitest run`: 12 files, 41 tests passed.

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
four 2880×1800 WebP shots — hero = product page photo and buy box, shot-01 =
category grid with filters, shot-02 = cart table, shot-03 = admin orders — plus
`manifest.json` with `demoLogin`, `previewCommand` and `proof{}`. The database
is reseeded `--seed 42` before capture. Capture command, viewport and file sizes:
[`docs/proof/screenshots.txt`](proof/screenshots.txt).
