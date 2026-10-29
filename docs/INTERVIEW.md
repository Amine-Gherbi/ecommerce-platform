# Twenty questions

Each answer is at most six lines and points at the code or the command that
settles it. Line numbers are from the rebuilt tree on 2026-10-23.

1. **What does checkout accept?**
   Exactly `{addressId, cartVersion}`. `parseCheckoutBody` reads those two
   fields and returns nothing else (`src/lib/checkout.ts:129-148`).

2. **How is the total computed?**
   `computeTotals` sums `priceCents × quantity` as integers, then adds
   `shippingForSubtotal` (`src/lib/checkout.ts:103-127`; rates at
   `src/lib/money.ts:14-38`).

3. **What stops a forged price?**
   Price fields are never read. The order is priced from `Variant.priceCents`
   inside the transaction (`src/lib/checkout.ts:243-249`). Test:
   `npx vitest run tests/integration/checkout.forged-price.test.ts`.

4. **What is `cartVersion`?**
   `sha256` of lines `variantId:quantity`, sorted by `variantId`, with no
   prices (`src/lib/checkout.ts:79-101`). Two reads of the same basket agree.

5. **What if the cart changed after the preview?**
   Recomputing the hash and comparing it with the submitted value returns
   `cart_changed`, mapped to 409 `CART_CHANGED`
   (`src/lib/checkout.ts:216-221`; `src/app/api/checkout/route.ts:68-75`).

6. **How is the idempotency key derived?**
   `sha256(cart.id + ':' + cartVersion)` (`src/lib/checkout.ts:150-152`). The
   unique index `(userId, idempotencyKey)` is the arbiter
   (`prisma/schema.prisma:183`).

7. **What does a concurrent double submit return?**
   One request creates the order; the other hits `P2002`, re-reads the winner
   and returns the same order with 200, not 409
   (`src/lib/checkout.ts:341-348`; `src/app/api/checkout/route.ts:63-66`).

8. **How is stock decremented without overselling?**
   One conditional `UPDATE … SET stock = stock - qty WHERE id = $id AND
   stock >= qty` per line, sorted by `variantId` so multi-line carts lock in a
   fixed order (`src/lib/checkout.ts:252-261`). A zero-row update throws and
   rolls the transaction back.

9. **How long is stock reserved?**
   30 minutes, computed as `now() + interval '30 minutes'` by the database, and
   inserted as one row per line in the same transaction
   (`src/lib/checkout.ts:263-271`, `:318-324`).

10. **What releases an abandoned reservation?**
    `sweepExpiredReservations` finds `releasedAt IS NULL AND expiresAt < now()`
    on `PENDING` orders, cancels them by compare-and-set, and restores stock in
    one transaction (`src/lib/reservations.ts:51-90`). Trigger:
    `POST /api/internal/sweep-reservations`.

11. **Can the sweeper and the webhook both restore the same units?**
    No. `releaseReservationsForOrder` claims each row with
    `UPDATE … WHERE id = $id AND releasedAt IS NULL`; only the winner adds stock
    (`src/lib/reservations.ts:27-43`).

12. **What moves an order to `PAID`?**
    A signed `payment_intent.succeeded` event whose amount equals
    `Order.totalCents`, whose currency matches, and whose order is still
    `PENDING` (`src/lib/payments-webhook.ts:169-211`).

13. **What happens on an amount mismatch?**
    The order moves to `REFUND_REQUIRED`, `paidAt` stays null, and the
    reservations are released (`src/lib/payments-webhook.ts:177-194`). Test:
    `npx vitest run tests/integration/checkout.amount-mismatch.test.ts`.

14. **What happens when the same webhook arrives twice?**
    The unique `WebhookEvent.eventId` insert fails first; the transaction rolls
    back before any side effect and the route answers 200 `duplicate`
    (`src/lib/payments-webhook.ts:112-119`, `:214-218`).

15. **What happens on an illegal transition?**
    A non-`PENDING` order logs and returns 200 `illegal_transition`; `PAID` is
    never downgraded (`src/lib/payments-webhook.ts:161-167`). Test:
    `npx vitest run tests/integration/webhook.transitions.test.ts`.

16. **How is the webhook signature checked?**
    `await request.text()` first, then
    `Stripe.webhooks.constructEvent(rawBody, header, STRIPE_WEBHOOK_SECRET)`.
    The SDK parses the `stripe-signature` header and compares the HMAC in
    constant time (`src/app/api/webhooks/payments/route.ts:26-38`;
    `src/lib/stripe.ts`).

17. **Which webhook requests get a 4xx?**
    Only a missing or wrong signature gets 400; an unconfigured secret gets 503
    and is rejected before any state change. Unknown intents, replays, illegal
    transitions and signed bodies the handler cannot classify get 200, because
    Stripe retries non-2xx (`src/app/api/webhooks/payments/route.ts:16-47`).

18. **Why do product edits not rewrite old orders?**
    `OrderItem` stores `sku`, `nameSnapshot`, `unitPriceCents` and `quantity`
    (`prisma/schema.prisma:187-200`). Test:
    `npx vitest run tests/integration/admin.products.test.ts`.

19. **How is the admin console protected?**
    Every admin page and action calls `requireAdmin`; anonymous visitors go to
    `/signin`, signed-in customers to `/account`, and the role comes from the
    signed JWT (`src/lib/admin.ts:12-25`).

20. **How is sign-in rate limited?**
    Five failed attempts per email + IP in a rolling minute, cleared on success
    (`src/lib/rate-limit.ts:8-44`; key built from `x-forwarded-for` at
    `src/app/signin/actions.ts:24-31`). Test:
    `npx vitest run tests/integration/signin-actions.test.ts`.
