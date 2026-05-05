# Why these indexes

The indexes below are the ones the rebuilt schema declares, copied from
`prisma/migrations/`. The plans are from this machine and this database, not
from a synthetic catalogue: 31 products in `shop_dev` on 2026-10-23,
PostgreSQL 16.13.

## The product listing

`getCategoryPageData` filters `Product` by `categoryId` and
`status = 'ACTIVE'`, loads variants and images, then sorts and paginates **in
memory** (`src/lib/catalog.ts:285-315`). It does not issue `ORDER BY … LIMIT`
for the page.

```sql
EXPLAIN (ANALYZE, BUFFERS, COSTS)
SELECT id, slug, title, "createdAt"
FROM "Product"
WHERE "categoryId" = (SELECT id FROM "Category" WHERE slug = 'headphones')
  AND status = 'ACTIVE';
```

```text
 Seq Scan on "Product"  (cost=8.17..10.62 rows=8 width=60) (actual time=0.064..0.084 rows=10 loops=1)
   Filter: (("categoryId" = $0) AND (status = 'ACTIVE'::"ProductStatus"))
   Rows Removed by Filter: 21
   Buffers: shared hit=4
   InitPlan 1 (returns $0)
     ->  Index Scan using "Category_slug_key" on "Category"  (cost=0.15..8.17 rows=1 width=16) (actual time=0.029..0.030 rows=1 loops=1)
           Index Cond: (slug = 'headphones'::text)
           Buffers: shared hit=2
 Planning Time: 11.353 ms
 Execution Time: 0.206 ms
```

The planner chooses a sequential scan because 31 rows fit in a handful of
pages; the composite index is not worth it at this size. The index exists for
the shape the query will have once the catalogue grows:

`Product_categoryId_status_createdAt_idx` on
`("categoryId", "status", "createdAt")`
(`prisma/migrations/20261023152658_rebuild/migration.sql:192`). Equality on
`categoryId` fixes the first key, `status` is a second equality, and
`createdAt` is there for the `newest` sort — but note the code currently sorts
in JavaScript, so only the filter benefits today. Pushing `ORDER BY` and
`LIMIT` into SQL is the change that would make the third column earn its place;
it has not been done.

## Search

Search is `contains` with `mode: "insensitive"` over title, description and
brand name (`src/lib/catalog.ts:344-354`). Prisma renders that as
`ILIKE '%query%'`, which no B-tree index can serve: a leading wildcard leaves
nothing to seek on. The rebuilt schema therefore has **no** full-text or GIN
index. At 31 products this is a sequential scan of a few pages; at a real
catalogue size it would be a table scan per search. Adding a `tsvector` column
with a GIN index is the obvious next step, and it is not implemented.

## Indexes that carry correctness, not speed

| Index | Why it exists |
| --- | --- |
| `Order_userId_idempotencyKey_key` (unique, `Order`) | The arbiter for one order per checkout attempt. The second concurrent insert blocks on it and raises `P2002`; the handler returns the winner (`src/lib/checkout.ts:304-323`). It is not a check-then-insert. |
| `Order_paymentIntentId_key` (unique) | The webhook carries the PaymentIntent id, not our order id; this is the lookup (`src/lib/payments-webhook.ts:142-150`) and the guard against two orders owning one intent. Added in `20261023191000_checkout_payment`. |
| `StockReservation_expiresAt_idx` | The sweeper's candidate scan, `releasedAt IS NULL AND expiresAt < now()` (`src/lib/reservations.ts:55-63`). |
| `StockReservation_orderId_variantId_key` (unique) | One reservation per line per order; a second insert for the same line cannot exist, so release counts cannot double. |
| `Product_categoryId_status_createdAt_idx` | The listing filter above. |
| `Variant_sku_key` (unique) | `OrderItem.sku` is a snapshot, but the live SKU must still be unique. |
| `Order_status_createdAt_idx` | The `(status, createdAt)` pair for status-filtered order lists. |
| `Variant_stock_nonnegative` (`CHECK (stock >= 0)`) | Not an index, but the backstop behind the conditional `UPDATE` (`migration.sql:283`). |

## What is not claimed

- No plan is shown for a catalogue larger than the seed. There is no
  measurement here of how these indexes behave at 50,000 products, and a plan
  invented for that size would not be evidence.
- The sort columns matter only once sorting moves into SQL. Today the page
  sorts `ProductRecord[]` in memory after fetching every matching row, which is
  fine at 31 rows and is the actual scalability limit of the listing.
