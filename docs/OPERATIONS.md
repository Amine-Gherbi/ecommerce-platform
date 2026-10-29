# Operations

There is no in-process scheduler: no `src/instrumentation.ts`, no background
interval, no job queue. Two things happen outside a request — expiring
reservations and receiving payment events — and both are request-driven. The
repository now *schedules* the sweeper request from GitHub Actions (see
[below](#scheduled-trigger)); it does not schedule work inside the process.

## Reservation sweeper

`POST /api/internal/sweep-reservations`
(`src/app/api/internal/sweep-reservations/route.ts:9-24`) calls
`sweepExpiredReservations()` (`src/lib/reservations.ts:51-90`) and returns
`{cancelledOrders, releasedReservations}`.

Call it by hand, or let the workflow do it:

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
database clock (`src/lib/checkout.ts:263-271`). If the app clock drifts from the
database clock, the transfer window shifts by that drift.

What it does not do: it does not contact a payment provider, refund money, or
revive a cancelled order.

### The sweeper is not the only guard

The webhook enforces the reservation window itself
(`src/lib/payments-webhook.ts:171-202`). Before moving a `PENDING` order to
`PAID` it asks the database whether an unreleased reservation for that order
already has `expiresAt <= now()`. If one does, the money arrived too late: the
order becomes `REFUND_REQUIRED`, the units go back in the same transaction, and
the response is 200 `{action: "expired"}`. The check uses the database clock,
the same one checkout used to set `expiresAt`.

This is why a missed or delayed sweep cannot sell reserved stock. A reservation
is spendable only while it is both unreleased and unexpired; the sweeper merely
*cleans up* expired holds, it does not define expiry. Two consequences:

- If the sweeper already cancelled the order, the status check at
  `src/lib/payments-webhook.ts:136-142` fires first and the delivery is a 200
  `illegal_transition`; the stock was already returned.
- If the sweeper has not run, the same late payment is a 200 `expired` and the
  stock is returned by the webhook instead. Either way the order is never
  `PAID` and the stock is never double-released (`releasedAt IS NULL`).

`tests/integration/webhook.expiry.test.ts` proves the second path: it creates a
pending order, moves `expiresAt` into the past, and never calls the sweeper.
The webhook returns `expired`, the order is `REFUND_REQUIRED` and the variant's
stock is back to its pre-checkout value.

## Scheduled trigger

`.github/workflows/sweep-reservations.yml` runs hourly:

```yaml
on:
  schedule:
    - cron: "0 * * * *"
  workflow_dispatch:
```

It `POST`s to `${vars.STORE_BASE_URL}/api/internal/sweep-reservations` with
`x-sweeper-secret: ${secrets.SWEEPER_SECRET}`, fails on a non-2xx
(`curl --fail-with-body`), retries twice, and times out after 3 minutes. It
uses `vars.STORE_BASE_URL` rather than a URL committed to the repository, and
`permissions: {}` because it needs no GitHub token.

**Why GitHub Actions and not a Render cron job.** Render's free plan does not
include cron jobs; the pricing page lists Cron Jobs starting at the paid
Starter plan, and the free-instance documentation says other service types do
not support Free instances. A Render cron service would therefore be the first
paid component of an otherwise free deployment. The endpoint is unchanged; only
the caller moved.

**Why hourly, against a 30-minute reservation TTL.** The cadence is a budget
calculation, not a preference. GitHub gives a private repository 2,000 Actions
minutes per month, billed per job rounded up to the whole minute:

| Cadence | Runs/month | Billed minutes | Verdict |
| --- | --- | --- | --- |
| every 5 min | 8,640 | ≥ 8,640 | far over budget |
| every 30 min | 1,440 | ≥ 1,440 | plausible, leaves 560 for CI but a single retry storm exhausts it |
| hourly | 720 | ~1,440 at 2 min/run (cold start plus the call) | leaves ≥ 560 for CI; chosen |

The hourly run assumes the free Render instance is usually asleep, so the first
request pays the ~60-second cold start; a job that has to wait is charged the
whole wait. Even at a deliberately pessimistic 2 billed minutes per run the
workflow costs 1,440 minutes, leaving 560 for `verify`, the webhook proof and
the rest of CI. A 30-minute cadence would consume 2,880 minutes at the same
assumption — over the allowance before a single CI run. The read-path expiry
above is what makes the slower cadence safe: an unswept reservation cannot be
spent, it can only delay the moment stock reappears in the catalogue. Worst
case, stock is held for one 30-minute TTL plus up to 59 minutes of scheduler
delay plus a cold start — under 90 minutes, versus 30 minutes with a perfectly
timed sweep.

## Payment webhook

`POST /api/webhooks/payments` (`src/app/api/webhooks/payments/route.ts`). The
provider is Stripe in sandbox mode; the route verifies the `stripe-signature`
header with `Stripe.webhooks.constructEvent` against `STRIPE_WEBHOOK_SECRET`
(or its `PAYMENTS_WEBHOOK_SECRET` alias — see [`DEPLOY.md`](DEPLOY.md)). The
endpoint contract is in [`DEPLOY.md`](DEPLOY.md).

Every delivery inserts a `WebhookEvent` row first, inside the same transaction
as any state change (`src/lib/payments-webhook.ts:85-94`). The unique
`eventId` is the replay arbiter: a redelivery rolls back before any side effect
and the route answers 200 `{action: "duplicate"}` (`:221-227`). Log lines worth
alerting on:

| Log | Meaning |
| --- | --- |
| `[payments-webhook] duplicate event=…` | expected on provider retries; not an error |
| `[payments-webhook] ignored event=…` | unknown type, missing PaymentIntent, or an intent no order owns |
| `[payments-webhook] illegal transition …` | an order was already paid/cancelled, or lost the compare-and-set race |
| `[payments-webhook] amount mismatch …` | order moved to `REFUND_REQUIRED` and stock returned |
| `[payments-webhook] reservation expired …` | a late payment hit an expired hold; order moved to `REFUND_REQUIRED` and stock returned |
| `[reservation-sweeper] order=… was settled before it could be cancelled` | the webhook won the race; expected occasionally |

An unhandled database error is not caught: the request returns 500 and Stripe
retries. That is intentional, and it is the one non-200 path after verification.
A bad signature is the only 400
(`src/app/api/webhooks/payments/route.ts:27-37`); an unconfigured secret is a
503 and rejects the delivery before any state change (`:16-25`).

## Health check

`GET /api/health` (`src/app/api/health/route.ts`) is unauthenticated and runs
`SELECT 1`. It returns 200 `{status: "ok", database: "ok"}` or 503
`{status: "degraded", database: "unavailable"}`. Render's `healthCheckPath` and
the Dockerfile's `HEALTHCHECK` both use it, so a process that is listening but
cannot reach PostgreSQL is reported unhealthy rather than half-up.

## What does not exist

- **No reconciliation job.** There is no `/api/jobs/*` route and no code that
  asks a payment provider about an order whose webhook never arrived. An unpaid
  order is cancelled by the sweeper after its 30-minute reservation expires.
- **No refund gateway.** `REFUND_REQUIRED` is a terminal state an admin can move
  to `REFUNDED` (`src/lib/admin-orders.ts:12-16`); nothing calls a payment
  provider.
- **No metrics endpoint, tracing or log aggregation.** The log lines above are
  `console.warn` output of the Node process.
- **No in-process scheduler.** The only recurring trigger is the hourly GitHub
  Actions workflow. If that workflow is disabled or its secrets are missing,
  expired holds accumulate until the next run — but, by the read-path check
  above, none of them can be spent.
