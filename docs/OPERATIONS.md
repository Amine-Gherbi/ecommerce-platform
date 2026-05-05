# Operations

There is no scheduler in this repository: no `src/instrumentation.ts`, no
background interval, no job queue. Two things happen outside a request —
expiring reservations and receiving payment events — and both are
request-driven.

## Reservation sweeper

`POST /api/internal/sweep-reservations`
(`src/app/api/internal/sweep-reservations/route.ts:9-24`) calls
`sweepExpiredReservations()` (`src/lib/reservations.ts:51-90`) and returns
`{cancelledOrders, releasedReservations}`.

Run it every minute from whatever the host provides:

```bash
curl -fsS -X POST https://<host>/api/internal/sweep-reservations \
  -H "x-sweeper-secret: $SWEEPER_SECRET"
```

| Situation | Response |
| --- | --- |
| `SWEEPER_SECRET` set, correct header | 200 with the counts |
| `SWEEPER_SECRET` set, wrong or missing header | 401 `UNAUTHORIZED` |
| `SWEEPER_SECRET` unset, `NODE_ENV=production` | 503 `SWEEPER_NOT_CONFIGURED` |
| `SWEEPER_SECRET` unset, development/test | 200 with the counts |

What one call does, in one transaction:

1. Selects reservations with `releasedAt IS NULL`, `expiresAt < now()` and
   `order.status = 'PENDING'` (`src/lib/reservations.ts:55-63`).
2. Cancels each distinct order with
   `UPDATE "Order" SET status = 'CANCELLED' WHERE id = $1 AND status = 'PENDING'`
   (`:71-75`). If a webhook paid the order first, zero rows update, a warning is
   logged and that order's stock is left alone (`:77-82`).
3. Releases the order's reservations and adds the units back
   (`releaseReservationsForOrder`, `:14-45`). The
   `releasedAt IS NULL` compare-and-set per row means a concurrent webhook and
   the sweeper cannot both restore the same units (`:27-34`).

Concurrency: two overlapping sweeps are safe for the same reason. The order
cancel is a compare-and-set and each reservation release is one too, so the
second caller counts zero. Expiry uses the passed `now` (default
`new Date()`) compared against `expiresAt`, which checkout set from the
database clock (`src/lib/checkout.ts:249-255`). If the app clock drifts from the
database clock, the transfer window shifts by that drift.

What it does not do: it does not contact a payment provider, refund money, or
revive a cancelled order. A payment that arrives after the sweep finds a
`CANCELLED` order and is answered 200 `illegal_transition`
(`src/lib/payments-webhook.ts:161-167`); the money side is out of scope for this
build.

## Payment webhook

`POST /api/webhooks/payments` (`src/app/api/webhooks/payments/route.ts`). The
provider is simulated; see [`DEPLOY.md`](DEPLOY.md) for the signature format.

Every delivery inserts a `WebhookEvent` row first, inside the same transaction
as any state change (`src/lib/payments-webhook.ts:112-119`). The unique
`eventId` is the replay arbiter: a redelivery rolls back before any side effect
and the route answers 200 `{action: "duplicate"}` (`:213-218`). Log lines worth
alerting on:

| Log | Meaning |
| --- | --- |
| `[payments-webhook] duplicate event=…` | expected on provider retries; not an error |
| `[payments-webhook] ignored event=…` | unknown type, missing PaymentIntent, or an intent no order owns |
| `[payments-webhook] illegal transition …` | an order was already paid/cancelled, or lost the compare-and-set race |
| `[payments-webhook] amount mismatch …` | order moved to `REFUND_REQUIRED` and stock returned |
| `[reservation-sweeper] order=… was settled before it could be cancelled` | the webhook won the race; expected occasionally |

An unhandled database error is not caught: the request returns 500 and the
provider retries. That is intentional, and it is the one non-200 path. A bad
signature is the only 400 (`src/app/api/webhooks/payments/route.ts:28-30`).

## What does not exist

- **No reconciliation job.** There is no `/api/jobs/*` route and no code that
  asks a payment provider about an order whose webhook never arrived. An unpaid
  order is cancelled by the sweeper after its 30-minute reservation expires.
- **No refund gateway.** `REFUND_REQUIRED` is a terminal state an admin can move
  to `REFUNDED` (`src/lib/admin-orders.ts:12-16`); nothing calls a payment
  provider.
- **No metrics endpoint, tracing or log aggregation.** The log lines above are
  `console.warn` output of the Node process.
- **No scheduler.** If the cron above is not configured, reservations never
  expire and stock stays held.
