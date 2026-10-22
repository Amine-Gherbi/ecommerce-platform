# Why these indexes

Two indexes carry the storefront's hot paths: the category listing and full-text
search. Both plans below are verbatim `EXPLAIN (ANALYZE, BUFFERS, COSTS)` output
from this machine (PostgreSQL 16.13, Node 22, local cluster on port 5433).

The seeded catalog is intentionally small (40 products), so the planner correctly
chooses sequential scans on it. To show what the indexes do once the catalog is
real, the plans below were captured against a temporary 50,000-row product set:
the rows were inserted inside a transaction, `ANALYZE` was run, the query was
explained, and the transaction was rolled back. The seeded database is unchanged
(40 products) after these runs.

```sql
BEGIN;
INSERT INTO "Product" (id, slug, name, description, "categoryId", "archivedAt", "createdAt", "updatedAt")
SELECT
  gen_random_uuid(),
  'bulk-' || g,
  (ARRAY['Canvas','Wool','Leather','Ceramic','Linen'])[1 + g % 5] || ' '
    || (ARRAY['Jacket','Sweater','Bag','Mug','Notebook'])[1 + (g / 5)::int % 5] || ' ' || g,
  'Bulk generated product ' || g || ' with canvas, wool and leather words for search.',
  c.id,
  CASE WHEN g % 100 = 0 THEN now() ELSE NULL END,
  now() - (g || ' seconds')::interval,
  now()
FROM generate_series(1, 50000) AS g
CROSS JOIN LATERAL (
  SELECT id FROM "Category" ORDER BY slug OFFSET (g % 5) LIMIT 1
) AS c;
ANALYZE "Product";
-- … EXPLAIN statements below …
ROLLBACK;
```

## 1. Product list by category — `Product_categoryId_createdAt_idx`

The listing is `WHERE "categoryId" = $1 AND "archivedAt" IS NULL ORDER BY
"createdAt" DESC`, paginated. The index is `(categoryId, createdAt)`; `archivedAt`
deliberately is **not** in it. Equality on `categoryId` fixes the first key, so the
second key supplies the sort order, and `archivedAt IS NULL` is a cheap recheck on
the heap rows actually read. Putting `archivedAt` between the equality and the sort
key would break that ordering guarantee, because `IS NULL` is not an equality for
pathkey purposes.

```sql
EXPLAIN (ANALYZE, BUFFERS, COSTS)
SELECT id, slug, name, "createdAt"
FROM "Product"
WHERE "categoryId" = (SELECT id FROM "Category" WHERE slug = 'apparel')
  AND "archivedAt" IS NULL
ORDER BY "createdAt" DESC
LIMIT 24;
```

```text
 Limit  (cost=8.58..32.66 rows=24 width=52) (actual time=0.043..0.083 rows=24 loops=1)
   Buffers: shared hit=47
   InitPlan 1 (returns $0)
     ->  Index Scan using "Category_slug_key" on "Category"  (cost=0.15..8.17 rows=1 width=16) (actual time=0.011..0.012 rows=1 loops=1)
           Index Cond: (slug = 'apparel'::text)
           Buffers: shared hit=2
   ->  Index Scan Backward using "Product_categoryId_createdAt_idx" on "Product"  (cost=0.41..9942.87 rows=9910 width=52) (actual time=0.041..0.077 rows=24 loops=1)
         Index Cond: ("categoryId" = $0)
         Filter: ("archivedAt" IS NULL)
         Buffers: shared hit=47
 Planning:
   Buffers: shared hit=58
 Planning Time: 6.718 ms
 Execution Time: 0.132 ms
(14 rows)
```

The backward index scan stops after 24 rows: 47 buffers and 0.132 ms for the first
page, with no sort node. For reference, the same predicate **without** `LIMIT` over
the same 50,040 rows plans as a bitmap index scan plus a quicksort
(`Execution Time: 12.799 ms`) — the index still narrows the category, but the
planner gives up on ordered retrieval when it expects to return all ~10,000 rows.
That is the right trade; the storefront only ever asks for a page.

## 2. Full-text search — `Product_search_tsv_idx`

Prisma cannot declare an expression index, so it is hand-written in the initial
migration:

```sql
CREATE INDEX "Product_search_tsv_idx"
  ON "Product"
  USING GIN (to_tsvector('english', "name" || ' ' || "description"));
```

The query must repeat the expression **exactly** — same regconfig, same
concatenation order — or the planner cannot match the index.

```sql
EXPLAIN (ANALYZE, BUFFERS, COSTS)
SELECT id, slug, name
FROM "Product"
WHERE to_tsvector('english', "name" || ' ' || "description") @@ websearch_to_tsquery('english', 'canvas jacket')
  AND "archivedAt" IS NULL
ORDER BY "createdAt" DESC
LIMIT 20;
```

```text
 Limit  (cost=5194.84..5197.14 rows=20 width=52) (actual time=83.816..92.390 rows=20 loops=1)
   Buffers: shared hit=1464
   ->  Gather Merge  (cost=5194.84..5873.11 rows=5898 width=52) (actual time=83.814..92.384 rows=20 loops=1)
         Workers Planned: 1
         Workers Launched: 1
         Buffers: shared hit=1464
         ->  Sort  (cost=4194.83..4209.57 rows=5898 width=52) (actual time=8.852..8.855 rows=10 loops=2)
               Sort Key: "createdAt" DESC
               Sort Method: top-N heapsort  Memory: 27kB
               Buffers: shared hit=1464
               Worker 0:  Sort Method: quicksort  Memory: 25kB
               ->  Parallel Bitmap Heap Scan on "Product"  (cost=1285.58..4037.88 rows=5898 width=52) (actual time=5.069..7.382 rows=4750 loops=2)
                     Recheck Cond: (to_tsvector('english'::regconfig, ((name || ' '::text) || description)) @@ '''canva'' & ''jacket'''::tsquery)
                     Filter: ("archivedAt" IS NULL)
                     Rows Removed by Filter: 250
                     Heap Blocks: exact=1158
                     Buffers: shared hit=1457
                     ->  Bitmap Index Scan on "Product_search_tsv_idx"  (cost=0.00..1283.07 rows=10132 width=0) (actual time=9.853..9.853 rows=10001 loops=1)
                           Index Cond: (to_tsvector('english'::regconfig, ((name || ' '::text) || description)) @@ '''canva'' & ''jacket'''::tsquery)
                           Buffers: shared hit=299
 Planning:
   Buffers: shared hit=11
 Planning Time: 0.317 ms
 Execution Time: 92.479 ms
(24 rows)
```

The GIN index is what keeps this from being a full sequential scan of every
description; the residual cost is the top-N sort by `createdAt`, which is inherent
to ranking matches by recency rather than by text score.

## The other indexes, briefly

- `Order_userId_idempotencyKey_key` (unique) — the arbiter for
  "one order per `(userId, idempotencyKey)`". A duplicate checkout hits the unique
  violation and returns the existing order; it is not a check-then-insert race.
- `Order_stripePaymentIntentId_key` (unique) — the webhook carries the PaymentIntent,
  not our order id; this is the lookup and the duplicate guard.
- `Order_status_createdAt_idx` — reconciliation scans pending orders by age.
- `StockReservation_expiresAt_idx` — the sweeper's
  `releasedAt IS NULL AND expiresAt < now()` candidate scan.
- `Variant_sku_key` (unique) and `OrderItem`'s snapshot columns — order history
  never depends on a live product row.
