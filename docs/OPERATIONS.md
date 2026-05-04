# Operations: sweeper, reconciliation, refunds

The platform provides no scheduler, so the two background behaviours have
different shapes.

## Reservation sweeper (every 5 minutes)

`src/instrumentation.ts` starts an in-process interval on the Node server. It
calls `sweepExpiredReservations()` immediately and then every five minutes.
The function is also exported as a plain function, so a worker or cron can
invoke it without the interval.

- Releases reservations with `releasedAt IS NULL AND expiresAt < now()` whose
  order is still `PENDING`.
- Cancels those orders with `UPDATE ... WHERE id = $1 AND status = 'PENDING'`.
  Zero rows means a webhook or the reconciliation job settled the order first;
  the sweeper logs and releases nothing.
- Stock is restored only after the cancel wins, in the same transaction.

## Reconciliation job (`POST /api/jobs/reconcile`)

Covers the webhook that never arrives. It selects `PENDING` orders older than
two minutes, retrieves each PaymentIntent and:

| PaymentIntent status | Action |
| --- | --- |
| `succeeded`, amount/currency match | `PENDING → PAID` |
| `succeeded`, mismatch | `PENDING → REFUND_REQUIRED`, stock returned |
| `canceled` | `PENDING → CANCELLED`, stock returned |
| anything else | left `PENDING` (sweeper owns the 30-minute expiry) |

Idempotent: only `PENDING` orders are scanned and every move is a
compare-and-set, so a second run does nothing and a concurrent webhook wins
cleanly.

Recommended cron (every five minutes):

```sh
*/5 * * * * curl -fsS -X POST https://<host>/api/jobs/reconcile \
  -H "authorization: Bearer $JOBS_SECRET"
```

`JOBS_SECRET` is required in production; without it the route answers 503
rather than exposing an unauthenticated job. In development/test the route is
open so it can be invoked directly.

## Refunds

`markRefundRequired(orderId, reason)` moves a paid order to `REFUND_REQUIRED`
and returns its stock. `refundOrder(orderId, gateway)` calls Stripe first and
moves `REFUND_REQUIRED → REFUNDED` only after a successful response. A failed
Stripe call leaves the order in `REFUND_REQUIRED` for a later retry; the
idempotency key is derived from the order id, so a retry cannot refund twice.
