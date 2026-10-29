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

Payments run through Stripe's sandbox. ADR 0005 records that migration; this
ADR keeps the checkout, reservation and webhook state machine it inherited.
The PaymentIntent id is created by Stripe, not generated locally. The sections
below describe the code that still holds those invariants.

## Decision

### 1. The cart version is a content hash, not a counter

`Cart` has no version column. Instead the server exposes
`cartVersion = sha256(canonical lines)`, where a line is `variantId:quantity`,
sorted by `variantId` (`src/lib/checkout.ts:79-101`). The checkout page echoes
that hash back.

Consequences:

- Two reads of the same cart produce the same version, so the two halves of a
  double submit derive the same idempotency key.
- Adding, removing or re-quantifying a line changes the version, so a stale
  preview cannot silently check out a different basket; the server answers 409
  `CART_CHANGED` (`src/lib/checkout.ts:216-221`).
- Prices are deliberately **not** in the hash. The server prices the order from
  `Variant.priceCents` at commit time; a client that has not refreshed after a
  price change is still charged the authoritative amount.
- An archived product is not filtered out of the version check. It stays in the
  basket, the version matches, and checkout then rejects the line because the
  product is no longer `ACTIVE` (`:239-243`), again as `CART_CHANGED`.

### 2. The unique index decides the double submit

```
idempotencyKey = sha256(cart.id + ':' + cartVersion)
```

(`src/lib/checkout.ts:150-152`.) `Order.@@unique([userId, idempotencyKey])` is
the arbiter. Both concurrent requests attempt the insert; Postgres blocks the
second on the index until the first commits, then raises `23505` (Prisma
`P2002`). The loser does **not** return 409: it re-reads the winner's order and
answers 200 with the same body (`src/lib/checkout.ts:341-348`;
`src/app/api/checkout/route.ts:63-66`). A duplicate checkout is a replay, not a
conflict.

There is also a pre-check inside the transaction (`:186-192`), but it is an
optimisation for the sequential case. The unique index is what holds under
concurrency.

### 3. Stock is decremented inside the same transaction, in id order

Order creation, stock decrement and reservation insertion share one
`db.$transaction` (`src/lib/checkout.ts:185-332`):

1. Load the cart and its variants; the cart must belong to the caller
   (`:193-211`).
2. Recompute the version and compare; reject `CART_CHANGED` on mismatch
   (`:216-221`).
3. Validate that `addressId` is a UUID and belongs to the caller, then snapshot
   the address onto the order (`:223-233`, `:297-305`).
4. Price with the pure `computeTotals` function (`:243-249`, `:103-127`). The
   requested quantity is never silently capped — a line that wants more than
   stock fails rather than charging less.
5. For each line in **ascending `variantId` order**, run

   ```sql
   UPDATE "Variant" SET stock = stock - $qty
   WHERE id = $id AND stock >= $qty
   ```

   A zero-row update throws `OUT_OF_STOCK`, which aborts the transaction
   (`:252-261`). The lock order is fixed so two multi-line carts cannot
   deadlock.
6. Insert the `Order`, its `OrderItem` snapshots (`sku`, `nameSnapshot`,
   `unitPriceCents`) and one `StockReservation` per line, with
   `expiresAt = now() + interval '30 minutes'` read from the database clock
   (`:288-327`).

The `CHECK (stock >= 0)` constraint is the backstop if this code is ever
bypassed (`prisma/migrations/20261023152658_rebuild/migration.sql:283`).

The PaymentIntent is created inside the transaction, after pricing and the
stock decrement, and its real `pi_…` id is written in the same insert
(`src/lib/checkout.ts:273-309`). A Stripe failure throws and rolls the stock
back, so there is no order without an intent and no post-commit window.

### 4. Webhook: the event row and the side effect commit together

Every delivery first inserts `WebhookEvent` inside the same transaction as the
state change (`src/lib/payments-webhook.ts:86-93`). A redelivery violates the
unique `eventId`, rolls back before any side effect, and the handler returns
`{action: "duplicate"}`; the route answers 200 (`:187-190`).

The order is found by `paymentIntentId` (`:119-135`). An event for an unknown
intent, an unsupported type, or a missing PaymentIntent id is recorded and
answered 200 `ignored` (`:95-133`).

Transitions are compare-and-set:

```sql
UPDATE "Order" SET status = 'PAID', "paidAt" = now()
WHERE id = $id AND status = 'PENDING'
```

A non-`PENDING` order is rejected before the update and logged as
`illegal_transition` (`:135-141`). A lost race on the compare-and-set is the
same answer (`:178-183`). Both are 200 because the provider retries non-2xx and
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
(`src/lib/payments-webhook.ts:143-150`):

- `event.data.amountCents === order.totalCents`
- `event.data.currency.toLowerCase() === order.currency.toLowerCase()`

Any disagreement moves the order to `REFUND_REQUIRED` with the same
compare-and-set and releases its stock (`:151-168`). There is no code path that
records a mismatched payment as `PAID`; the first test in
`tests/integration/checkout.amount-mismatch.test.ts` asserts both the status and
the restored stock.

### 6. Signature verification precedes every side effect

The route reads `await request.text()` before anything parses JSON
(`src/app/api/webhooks/payments/route.ts:15`), then passes the raw body and the
`stripe-signature` header to
`Stripe.webhooks.constructEvent(rawBody, signature, STRIPE_WEBHOOK_SECRET)`
(`:27-37`). A missing or wrong signature returns 400 and touches nothing; an
unconfigured secret returns 503 and also touches nothing. That is the only 4xx:
the caller is not Stripe, and a retry cannot fix a bad secret.

A body that is correctly signed but not a shape the handler understands is
answered 200 `ignored` (`:39-45`), so Stripe does not retry forever.

The SDK enforces a timestamp tolerance on the header. The event id is still what
makes an old captured delivery harmless, because it is a 200 duplicate.

### 7. Stripe owns the PaymentIntent and the signature

Checkout calls `client.paymentIntents.create` with the server total, `eur`,
`metadata.orderId`, `metadata.orderNumber` and the checkout idempotency key
(`src/lib/stripe.ts`). The webhook path verifies with
`Stripe.webhooks.constructEvent`; the state machine above is unchanged.

The three keys come from the environment — `STRIPE_SECRET_KEY`,
`NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY`, `STRIPE_WEBHOOK_SECRET` — and none is
committed. The test suites inject a PaymentIntent creator and sign deliveries
with `Stripe.webhooks.generateTestHeaderString`, so they exercise the same code
without an external call. ADR 0005 records the migration.

### 8. Address handling

Checkout accepts exactly `{addressId, cartVersion}` (`:129-148`). `addressId`
must be a UUID and must resolve to an `Address` owned by the caller
(`:223-233`). The selected address is copied into `Order.address` as JSON at
commit time (`:297-305`), so later edits to the address book do not rewrite
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
- **Keep a locally generated PaymentIntent id and our own HMAC.** That was the
  first build. It proved the state machine but not the provider contract;
  ADR 0005 replaced it with the sandbox SDK and the SDK verifier.
- **Mock the Stripe SDK globally in every suite.** Rejected: a global mock can
  drift from the provider's shape. The checkout suites inject only the
  PaymentIntent creator, and the webhook suites run the real verifier over
  headers produced by the SDK's test helper.

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
