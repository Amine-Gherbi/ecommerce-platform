# ADR 0004 — Idempotent checkout, reserved stock and replay-safe webhooks

- **Status:** Accepted
- **Date:** 2026-10-23
- **Milestone:** M4 (checkout + webhooks), revised for the rebuild
- **Supersedes:** —
- **Proof:** `tests/integration/checkout.*.test.ts`,
  `tests/integration/webhook.*.test.ts`,
  `tests/integration/reservations.sweeper.test.ts`,
  `tests/integration/signin-actions.test.ts`

## Context

Checkout is where three independent failure modes meet:

1. **The client can lie.** A browser can post any total it likes.
2. **The same intent can arrive twice.** A double-click, a retried `fetch`, or
   a payment webhook redelivery are normal traffic, not errors.
3. **Two buyers can want the last unit.** Reading stock and then writing it is
   a lost-update bug waiting to happen.

The schema already carries the arbiters: `Order.@@unique([userId,
idempotencyKey])`, `Variant.stock` with `CHECK (stock >= 0)`,
`StockReservation` and `WebhookEvent.eventId` unique. M4 wires behaviour to
those constraints instead of adding read-then-write guards in application code.

Payments are **simulated** in this build. There is no Stripe SDK call: checkout
writes `pi_demo_<hex>` as the PaymentIntent id (`src/lib/checkout.ts:279`), and
the webhook is called by whatever simulates the provider. This ADR describes
what the code does, not a live integration.

## Decision

### 1. The cart version is a content hash, not a counter

`Cart` has no version column. Instead the server exposes
`cartVersion = sha256(canonical lines)`, where a line is `variantId:quantity`,
sorted by `variantId` (`src/lib/checkout.ts:77-84`). The checkout page echoes
that hash back.

Consequences:

- Two reads of the same cart produce the same version, so the two halves of a
  double submit derive the same idempotency key.
- Adding, removing or re-quantifying a line changes the version, so a stale
  preview cannot silently check out a different basket; the server answers 409
  `CART_CHANGED` (`src/lib/checkout.ts:204-206`).
- Prices are deliberately **not** in the hash. The server prices the order from
  `Variant.priceCents` at commit time; a client that has not refreshed after a
  price change is still charged the authoritative amount.
- An archived product is not filtered out of the version check. It stays in the
  basket, the version matches, and checkout then rejects the line because the
  product is no longer `ACTIVE` (`:222-226`), again as `CART_CHANGED`.

### 2. The unique index decides the double submit

```
idempotencyKey = sha256(cart.id + ':' + cartVersion)
```

(`src/lib/checkout.ts:133-135`.) `Order.@@unique([userId, idempotencyKey])` is
the arbiter. Both concurrent requests attempt the insert; Postgres blocks the
second on the index until the first commits, then raises `23505` (Prisma
`P2002`). The loser does **not** return 409: it re-reads the winner's order and
answers 200 with the same body (`src/lib/checkout.ts:304-323`;
`src/app/api/checkout/route.ts:56-59`). A duplicate checkout is a replay, not a
conflict.

There is also a pre-check inside the transaction (`:170-176`), but it is an
optimisation for the sequential case. The unique index is what holds under
concurrency.

### 3. Stock is decremented inside the same transaction, in id order

Order creation, stock decrement and reservation insertion share one
`db.$transaction` (`src/lib/checkout.ts:169-303`):

1. Load the cart and its variants; the cart must belong to the caller
   (`:178-196`).
2. Recompute the version and compare; reject `CART_CHANGED` on mismatch
   (`:204-206`).
3. Validate that `addressId` is a UUID and belongs to the caller, then snapshot
   the address onto the order (`:208-217`, `:270-277`).
4. Price with the pure `computeTotals` function (`:228-233`, `:86-107`). The
   requested quantity is never silently capped — a line that wants more than
   stock fails rather than charging less.
5. For each line in **ascending `variantId` order**, run

   ```sql
   UPDATE "Variant" SET stock = stock - $qty
   WHERE id = $id AND stock >= $qty
   ```

   A zero-row update throws `OUT_OF_STOCK`, which aborts the transaction
   (`:235-244`). The lock order is fixed so two multi-line carts cannot
   deadlock.
6. Insert the `Order`, its `OrderItem` snapshots (`sku`, `nameSnapshot`,
   `unitPriceCents`) and one `StockReservation` per line, with
   `expiresAt = now() + interval '30 minutes'` read from the database clock
   (`:249-298`).

The `CHECK (stock >= 0)` constraint is the backstop if this code is ever
bypassed (`prisma/migrations/20261023152658_rebuild/migration.sql:283`).

Nothing external happens after commit. The `paymentIntentId` is a generated
`pi_demo_*` string written in the same insert (`:279`), so there is no
post-commit window in which an order exists without a payment reference.

### 4. Webhook: the event row and the side effect commit together

Every delivery first inserts `WebhookEvent` inside the same transaction as the
state change (`src/lib/payments-webhook.ts:112-119`). A redelivery violates the
unique `eventId`, rolls back before any side effect, and the handler returns
`{action: "duplicate"}`; the route answers 200 (`:213-218`).

The order is found by `paymentIntentId` (`:142-150`). An event for an unknown
intent, an unsupported type, or a missing PaymentIntent id is recorded and
answered 200 `ignored` (`:121-159`).

Transitions are compare-and-set:

```sql
UPDATE "Order" SET status = 'PAID', "paidAt" = now()
WHERE id = $id AND status = 'PENDING'
```

A non-`PENDING` order is rejected before the update and logged as
`illegal_transition` (`:161-167`). A lost race on the compare-and-set is the
same answer (`:204-209`). Both are 200 because the provider retries non-2xx and
no amount of retrying can make an illegal transition legal.

There is no `CANCELLED → PAID`. If the sweeper has already cancelled an unpaid
order, a later payment is recorded as `illegal_transition` and the order stays
`CANCELLED`; the units have already been returned to stock. Handling money that
arrives after expiry is out of scope for this build.

`REFUND_REQUIRED` (from an amount mismatch) and `CANCELLED` (from the sweeper
or an admin) release the reservation. `PAID` keeps it as the audit trail for
the sale.

### 5. Amount mismatch is a refund, never a payment

Before an order may become `PAID`, two facts must agree
(`src/lib/payments-webhook.ts:169-175`):

- `event.data.amountCents === order.totalCents`
- `event.data.currency.toLowerCase() === order.currency.toLowerCase()`

Any disagreement moves the order to `REFUND_REQUIRED` with the same
compare-and-set and releases its stock (`:177-194`). There is no code path that
records a mismatched payment as `PAID`; the first test in
`tests/integration/checkout.amount-mismatch.test.ts` asserts both the status and
the restored stock.

### 6. Signature verification precedes every side effect

The route reads `await request.text()` before anything parses JSON
(`src/app/api/webhooks/payments/route.ts:16`), verifies
`x-payments-signature: t=<unix>,v1=<hex>` over `` `${t}.${rawBody}` `` with
`PAYMENTS_WEBHOOK_SECRET` (`src/lib/webhook-signature.ts:13-21`, `:63-90`), and
only then processes the event. A missing or wrong signature returns 400 and
touches nothing (`route.ts:28-30`). That is the only 4xx: the caller is not the
provider, and a retry cannot fix a bad secret.

A body that is correctly signed but not a shape the handler understands is
answered 200 `ignored` (`:32-38`), so the provider does not retry forever.

The MAC covers the timestamp but there is no freshness window; the event id is
what makes an old captured delivery harmless, because it is a 200 duplicate.

### 7. No Stripe key is needed or used

There is no `stripe` import under `src/`, and checkout does not call an
external service. The `stripe` package remains in `package.json` but is
unreferenced; the PaymentIntent id is `pi_demo_<hex>`. The signature scheme is
our own, documented in [`../DEPLOY.md`](../DEPLOY.md); it is not
`Stripe-Signature`.

No test claims a live Stripe path passed.

### 8. Address handling

Checkout accepts exactly `{addressId, cartVersion}` (`:112-131`). `addressId`
must be a UUID and must resolve to an `Address` owned by the caller
(`:208-217`). The selected address is copied into `Order.address` as JSON at
commit time (`:270-277`), so later edits to the address book do not rewrite
order history. A missing, malformed or foreign address returns
`invalid_address`, mapped to 400 by the route.

## Alternatives considered

- **Database cart version column.** Correct, but every cart mutation needs a
  write even when only the quantity is read. The content hash gives the same
  double-submit guarantee with no schema change.
- **`SELECT ... FOR UPDATE` on the cart, then check stock.** Works, but locks
  the cart row for the whole checkout and still needs the conditional update
  for the stock race. The unique index plus conditional `UPDATE` is smaller
  and keeps the database as the single arbiter.
- **Return 409 for a duplicate idempotency key.** Simpler to write, wrong for
  the client: a retried request already succeeded, and a 409 invites a third
  attempt.
- **Catch stock failure and delete the order.** Deleting inside a transaction
  is what rollback already does; a separate compensation path would be another
  thing to get wrong.
- **Add Stripe and mock it in tests.** Rejected for this build. A mock would
  make a green test that proves nothing about the real call; a simulated
  provider with a real HMAC is honest about what is exercised.

## Consequences

- A cart mutation between preview and submit is a 409 `CART_CHANGED`, not a
  silent reprice. The client must reload.
- Idempotency is per `(user, cart contents)`. Adding an item after a successful
  checkout creates a new key and therefore a new order, which is the intended
  "one order per checkout attempt".
- A late payment against a cancelled order is refused as an illegal transition
  and the money is not applied. A real deployment would need a refund path
  outside this code; there is none.
- Stock released by a mismatch or a sweep can be bought by someone else. A
  customer who retries the same PaymentIntent later may find the unit gone;
  the retry is a new checkout, not a resume.
- The in-memory rate limiter is per process
  (`src/lib/rate-limit.ts`). It is a speed bump for password guessing on a
  single instance, not a billing control; a restart clears at most one minute
  of windows.
