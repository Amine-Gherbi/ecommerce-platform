# ADR 0005 — Stripe sandbox payments

- **Status:** Accepted
- **Relates to:** ADR 0004 (idempotent checkout, reserved stock, replay-safe
  webhooks)
- **Proof:** `src/lib/stripe.test.ts`,
  `tests/integration/checkout.payment-intent.test.ts`,
  `tests/integration/webhook.replay.test.ts`,
  `tests/integration/webhook.transitions.test.ts`,
  `tests/integration/checkout.amount-mismatch.test.ts`

## Context

ADR 0004 established the part of checkout that is hard: the server prices every
line, stock moves under a conditional `UPDATE` inside the order transaction,
the `(userId, idempotencyKey)` index decides a double submit, and the webhook
state machine is compare-and-set. It deliberately stopped at the provider
boundary: the PaymentIntent id was generated locally and the webhook was signed
with our own HMAC. That exercised the state machine but proved nothing about
the contract a real provider enforces.

This ADR replaces only that boundary. The money invariants, the transaction
boundary, the idempotency key, the replay arbiter and the `PAID` /
`REFUND_REQUIRED` / `illegal_transition` outcomes are unchanged.

## Decision

### 1. The server creates the PaymentIntent

`placeOrder` computes the total with `computeTotals` from `Variant.priceCents`,
runs the conditional stock decrements, then calls
`client.paymentIntents.create` before inserting the `Order`
(`src/lib/checkout.ts:280-309`). The request carries:

- `amount: totals.totalCents` — integer cents, never a client number;
- `currency: "eur"` — the order's currency;
- `metadata.orderId` and `metadata.orderNumber` — the row the intent belongs to;
- `automatic_payment_methods.enabled` — so the Payment Element can choose;
- `{ idempotencyKey }` — the existing
  `sha256(cart.id + ':' + cartVersion)`, not a second key.

The call sits inside the same `db.$transaction` as the stock decrement and the
order insert. If Stripe fails, the transaction rolls back: no order and no
reservation survive, and the units return with the rollback. The reverse is not
claimed: a PaymentIntent can outlive a transaction that later rolls back. It
carries order metadata, is never confirmed, and remains an unpaid intent in the
sandbox.

If the intent is created, its real `pi_…` id is written to
`Order.paymentIntentId` in the same insert. There is no local generator.

### 2. The webhook uses Stripe's verifier

The route still reads `await request.text()` before any parse
(`src/app/api/webhooks/payments/route.ts:15`). It then calls
`Stripe.webhooks.constructEvent(rawBody, signature, STRIPE_WEBHOOK_SECRET)`
with the `stripe-signature` header (`:27-37`). There is no fallback secret and
no "skip verification when unconfigured" branch:

- missing or wrong signature → 400, no database write;
- unconfigured `STRIPE_WEBHOOK_SECRET` → 503, no database write (fail closed);
- signed event the handler cannot classify → 200 `ignored`;
- replay → 200 `duplicate`, one `WebhookEvent` row, one transition.

`parsePaymentsEvent` only lifts `data.object.id`, `data.object.amount` and
`data.object.currency` into the shape the existing state machine already
consumed (`src/lib/payments-webhook.ts:36-77`). The state machine itself is not
modified.

### 3. The browser collects the card

After the order is created, the checkout API returns the amount, the order
number and the PaymentIntent `client_secret`. `/checkout` mounts the Stripe
Payment Element with `@stripe/react-stripe-js` and `@stripe/stripe-js` under
`NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY`. `confirmPayment` uses a `return_url` to
the order page; the order stays `PENDING` until the webhook confirms it.

The page states that the payment is a Stripe sandbox payment and names the test
card `4242 4242 4242 4242`. A missing publishable key is surfaced as a
configuration state, not as a claim that the order was paid.

### 4. Secrets and tests

The three values come from process env only: `STRIPE_SECRET_KEY`,
`NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY`, `STRIPE_WEBHOOK_SECRET`. `.env.example`
lists the names with empty placeholders; no value is written to the repository.

Vitest never calls `api.stripe.com`:

- checkout integration tests inject a `createPaymentIntent` dependency, so
  pricing, transaction boundaries and the persisted id are real while the
  provider call is a local function;
- `src/lib/stripe.test.ts` injects a Stripe client into `createPaymentIntent`
  and asserts the amount, currency, metadata and idempotency key;
- webhook tests sign the raw body with
  `Stripe.webhooks.generateTestHeaderString` and go through the real
  `constructEvent`, including the wrong-secret and unconfigured-secret cases.

Playwright starts a local mock of `POST /v1/payment_intents`, sets a dummy
sandbox key and points the SDK at that host through `STRIPE_API_HOST` (ignored
when `NODE_ENV=production`), so the browser checkout spec exercises the server
path without a network call.

## Consequences

- A Stripe round-trip now happens while the checkout transaction holds the
  stock rows. The reservation window still starts from the database clock, but
  the transaction is longer by one network call.
- The Stripe idempotency key makes a retried request resolve to the same
  PaymentIntent. A duplicate checkout still returns the winning order and does
  not create a second intent.
- An intent created for a transaction that later rolls back is orphaned in the
  sandbox. It is unpaid and carries metadata, but nothing reconciles it; this
  is the mirror image of "no order without an intent".
- `REFUND_REQUIRED` still records a decision; no refund API call is made. An
  admin moves it to `REFUNDED`, and this ADR does not add a refund gateway.
- The webhook now inherits Stripe's timestamp tolerance. A captured delivery
  older than the tolerance is a 400; within it, the unique event id makes the
  replay a no-op.
