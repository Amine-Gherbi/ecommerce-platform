# ADR 0004 — Idempotent checkout, reserved stock and replay-safe webhooks

- **Status:** Accepted
- **Date:** 2026-10-23
- **Milestone:** M4 (checkout + webhooks)
- **Supersedes:** —
- **Proof:** `tests/integration/checkout.*.test.ts`, `tests/integration/webhook.*.test.ts`, `tests/integration/security.rate-limit.test.ts`

## Context

Checkout is the one place where three independent failure modes meet:

1. **The client can lie.** A browser can post any total it likes.
2. **The same intent can arrive twice.** A double-click, a retried `fetch`, or a
   Stripe webhook redelivery are all normal traffic, not errors.
3. **Two buyers can want the last unit.** Reading stock and then writing it is
   a lost-update bug waiting to happen.

The schema settled in M1 already carries the arbiters: `Order.@@unique([userId,
idempotencyKey])`, `Variant.stock` with `CHECK (stock >= 0)`,
`StockReservation`, and `WebhookEvent.stripeEventId` as a primary key. M4 wires
behaviour to those constraints instead of adding read-then-write guards in
application code.

## Decision

### 1. The cart version is a content hash, not a counter

`Cart` has no version column, and adding one would mean a write on every
quantity change just to bump a number. Instead the server exposes
`cartVersion = sha256(canonical lines)`, where a line is `variantId:quantity`
sorted by `variantId`. The checkout page echoes that hash back.

Consequences:

- Two reads of the same cart produce the same version, so the two halves of a
  double-submit derive the same idempotency key.
- Adding, removing or re-quantifying a line changes the version, so a stale
  preview cannot silently check out a different basket; the server answers 409
  `CART_CHANGED` and the client reloads.
- Prices are deliberately **not** in the hash. The server prices the order from
  `Variant.priceCents` at commit time anyway; a client that has not refreshed a
  price change is still charged the authoritative amount.
- Archived variants are included when the version is checked and then reject
  the checkout with `CART_CHANGED`, rather than disappearing from the order.

### 2. The unique index decides the double submit

```
idempotencyKey = sha256(cart.id + ':' + cartVersion)
```

`Order.@@unique([userId, idempotencyKey])` is the arbiter. Both concurrent
requests attempt `INSERT`; Postgres blocks the second on the index until the
first commits, then raises `23505` (Prisma `P2002`). The loser does **not**
return 409: it re-reads the winner's order and answers 200 with the same body.
A duplicate checkout attempt is a replay, not a conflict.

This also means there is no check-then-insert race: the check *is* the insert.

### 3. Stock is reserved inside the same transaction, in id order

Order creation, stock decrement and reservation insertion share one
`db.$transaction`:

1. Load the cart and its variants (the cart must belong to the caller and not
   be expired).
2. Recompute the version and compare; reject `CART_CHANGED` on mismatch.
3. Price with the pure `computeTotals` function. The requested quantity is
   never silently capped — a line that wants more than stock fails rather than
   charging less.
4. Insert the `Order` and its `OrderItem` snapshots (`sku`, `nameSnapshot`,
   `unitPriceCents`).
5. For each line in **ascending `variantId` order**, run

   ```sql
   UPDATE "Variant" SET stock = stock - $qty
   WHERE id = $id AND stock >= $qty
   ```

   A zero-row update throws `OUT_OF_STOCK`, which aborts the transaction: the
   order row and any earlier decrements are rolled back. The lock order is
   fixed so two multi-line carts cannot deadlock (40P01).
6. Insert one `StockReservation` per line with
   `expiresAt = now() + 30 minutes`.

The `CHECK (stock >= 0)` constraint from M1 remains the backstop if this code
is ever bypassed.

Only after commit is a PaymentIntent created, with
`{ idempotencyKey: 'pi_' + order.id }`. Its id is persisted to
`Order.stripePaymentIntentId` immediately. A replay with an already-persisted
intent *retrieves* it rather than creating another; reusing the creation
idempotency key after Stripe's 24-hour window would otherwise mint a second
intent.

### 4. Webhook: the event row and the side effect commit together

Every delivery first inserts `WebhookEvent` inside the same transaction as the
state change. A redelivery violates the primary key, rolls back before any side
effect, and the route answers 200 (`action: "duplicate"`).

The order is found by `stripePaymentIntentId` — Stripe does not know our order
id, and metadata is not a transactional lookup. An event for an unknown intent
is recorded and answered 200 (`ignored`); it may belong to another environment.

Transitions are declared in one table (`src/lib/order-state.ts`) and applied as
compare-and-set:

```sql
UPDATE "Order" SET status = $to WHERE id = $id AND status = $from
```

Zero rows means an illegal move or a lost race. Both are logged and answered
200: Stripe retries non-2xx for three days, and no amount of retrying can make
an illegal transition legal. The only 500s are transient failures (database
unreachable while processing), where a retry is exactly what we want.

`CANCELLED → PAID` is explicitly legal. Money that arrives after the sweeper
cancelled an abandoned checkout is still money; the order must reflect it.
Entering `CANCELLED`, `PAYMENT_FAILED`, `REFUND_REQUIRED` or `REFUNDED` releases
the reservation (stock is incremented and `releasedAt` is stamped); entering
`PAID` keeps it, because the reservation row is the audit trail for the sale.

### 5. Amount mismatch is a refund, never a payment

Before an order may become `PAID`, three independent facts must agree:

- `payment_intent.currency === order.currency`
- `payment_intent.amount_received === order.totalCents`
- `SUM(orderItem.unitPriceCents * quantity) === order.subtotalCents` and
  `subtotalCents - discountCents === totalCents`

Any disagreement sends the order to `REFUND_REQUIRED` and releases its stock.
There is no code path that records a mismatched payment as `PAID`.

### 6. Signature verification precedes every side effect

The route reads `await request.text()` before anything parses JSON, verifies
`Stripe-Signature` against `STRIPE_WEBHOOK_SECRET`, and only then opens a
transaction. A missing, wrongly signed or tampered body returns 400 and touches
nothing. Returning 400 is safe here because the request is not from Stripe;
Stripe's own retries are answered 200.

### 7. Without a Stripe key, tests use an explicitly local intent

The machine running the suite has no `STRIPE_SECRET_KEY`. Checkout therefore
falls back to a deterministic `pi_local_<orderId>` intent when
`NODE_ENV !== 'production'`. It is clearly named, it is never created in
production, and it is not presented as proof of the Stripe integration.

The concurrency, oversell, forged-price, replay, transition, mismatch,
signature and rate-limit suites all run against the real handlers and the local
Postgres. The single assertion that requires Stripe test mode — that a
double-submit produces one real PaymentIntent with the recomputed amount — is
skipped and the suite prints:

```
BLOCKED: no Stripe test key
```

No test currently claims a live Stripe path passed.

### 8. Address handling in M4

The API accepts exactly `{addressId, cartVersion}` and validates `addressId` as
a non-empty string. M1's schema has no `Address` table and `Order` has no
address columns, so M4 does not persist it. This is deliberately visible here
rather than papered over with a denormalised column; address capture lands with
the order screens in M5. Nothing in the money path depends on it.

## Alternatives considered

- **Database cart version column.** Correct, but every cart mutation needs a
  write even when only the quantity is read. The content hash gives the same
  double-submit guarantee with no schema change and no migration.
- **`SELECT ... FOR UPDATE` on the cart, then check stock.** Works, but locks
  the cart row for the whole checkout and still needs the conditional update
  for the stock race. The unique index plus conditional `UPDATE` is smaller
  and keeps the database as the single arbiter.
- **Return 409 for a duplicate idempotency key.** Simpler to write, wrong for
  the client: a retried request already succeeded. It would also make a
  double-click look like a failure and invite a third attempt.
- **Catch stock failure and delete the order.** Deleting inside a transaction
  is what rollback already does; a separate compensation path would be another
  thing to get wrong.
- **Mock the Stripe SDK in the test-mode assertion.** Rejected: a mock would
  make the test pass without proving the real call. The suite is explicit about
  the skip instead.

## Consequences

- A cart mutation between preview and submit is a 409 `CART_CHANGED`, not a
  silent reprice. The client must reload.
- Idempotency is per `(user, cart contents)`. Adding an item after a successful
  checkout creates a new key and therefore a new order, which is the intended
  "one order per checkout attempt".
- Late payments against cancelled orders are recorded as `PAID` even though the
  units may already have been returned to stock. M5's fulfilment/refund path
  owns that reconciliation; refusing the money is not an option.
- Stock released by `PAYMENT_FAILED` means a customer who retries the same
  PaymentIntent later may find the unit gone; the retry path must re-check
  availability. This matches the reserve-then-commit model.
- The in-memory rate limiter is per process. It is a speed bump for card
  testing on a single-instance deployment, not a billing control; a restart
  clears at most one minute of windows.
