# Invariants

Each row maps one invariant to one test file. If a change breaks the invariant,
that file must fail; the "break it" note says what to mutate to check that it
does.

| # | Invariant | Enforced at | Test file |
| --- | --- | --- | --- |
| 1 | Money is integer cents; the client cannot set a price | `src/lib/checkout.ts:86-107` (integer arithmetic), `:112-131` (body has two fields), `:233` (price from `Variant.priceCents`) | `tests/integration/checkout.forged-price.test.ts` |
| 2 | `OrderItem` snapshots `sku`, `nameSnapshot`, `unitPriceCents`; history survives product edits | `prisma/schema.prisma:187-200`; `src/lib/checkout.ts:280-287` | `tests/integration/admin.products.test.ts:116-159` — "changes the variant price without changing an existing order" |
| 3 | One order per `(userId, idempotencyKey)`; a duplicate returns that order | `prisma/schema.prisma:163-185` (unique index); `src/lib/checkout.ts:166-176`, `:304-323`; 200 at `src/app/api/checkout/route.ts:56-59` | `tests/integration/checkout.double-submit.test.ts` |
| 4 | Stock never goes negative; the reservation is written in the same transaction | `src/lib/checkout.ts:169-303`, conditional update `:235-244`; `CHECK ("stock" >= 0)` at `prisma/migrations/20261023152658_rebuild/migration.sql:283` | `tests/integration/checkout.oversell.test.ts` |
| 5 | A replayed webhook is a 200 no-op | `src/lib/payments-webhook.ts:112-119`, `:214-218`; `src/app/api/webhooks/payments/route.ts:40-41` | `tests/integration/webhook.replay.test.ts` |
| 6 | An illegal transition is a 200 with a log; `PAID` is never downgraded | `src/lib/payments-webhook.ts:161-167`, `:204-209` | `tests/integration/webhook.transitions.test.ts` |
| 7 | An amount or currency mismatch becomes `REFUND_REQUIRED`, never `PAID` | `src/lib/payments-webhook.ts:169-194` | `tests/integration/checkout.amount-mismatch.test.ts` |
| 8 | Admin archive hides a product without touching order history | `src/lib/admin-products.ts:427-467`; `ProductStatus` at `prisma/schema.prisma:21-25` | `tests/integration/admin.products.test.ts:161-215` — "archives without touching the order and restores on request" |

Invariants 2 and 8 share a file because the same suite covers both sides of
"product edits do not rewrite orders"; the line ranges above are separate test
cases, and either one failing fails the file.

## Run all of them

```bash
npx vitest run \
  tests/integration/checkout.forged-price.test.ts \
  tests/integration/admin.products.test.ts \
  tests/integration/checkout.double-submit.test.ts \
  tests/integration/checkout.oversell.test.ts \
  tests/integration/webhook.replay.test.ts \
  tests/integration/webhook.transitions.test.ts \
  tests/integration/checkout.amount-mismatch.test.ts
```

## Break it on purpose

| # | Mutation that must turn the test red |
| --- | --- |
| 1 | Make `parseCheckoutBody` copy `totalCents` from the body and `placeOrder` use it instead of `computeTotals` (`src/lib/checkout.ts:112`, `:233`). |
| 2 | Replace the `OrderItem` snapshot fields with a join to the live `Variant`/`Product` price. |
| 3 | Drop `@@unique([userId, idempotencyKey])` from `Order`, or return 409 instead of the existing order on `P2002`. |
| 4 | Replace the conditional `UPDATE … WHERE stock >= qty` with a read-then-write, or move the reservation insert outside the transaction. |
| 5 | Remove the unique constraint on `WebhookEvent.eventId`, or process the state change before inserting the event row. |
| 6 | Allow `UPDATE "Order" SET status='REFUND_REQUIRED'` to run without `AND status='PENDING'`. |
| 7 | Treat `amountCents !== totalCents` as `PAID`, or skip `releaseReservationsForOrder` on mismatch. |
| 8 | Set `Product.status = "ARCHIVED"` and also delete or rewrite the product's `OrderItem` rows. |

The point of each mutation is not that the suite is fragile; it is that the
constraint or the transaction boundary is what holds the invariant, not a
comment.
