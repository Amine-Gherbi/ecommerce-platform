# ecommerce-platform

A storefront whose differentiator is **money correctness**: totals are recomputed on the server from `Variant.priceCents`, one order exists per checkout attempt even under concurrency, stock is reserved rather than leaked, Stripe webhooks are idempotent and order-agnostic, and a reconciliation job settles the webhook that never arrives.

**Status:** M2 — catalog and product pages. No cart, auth or checkout yet (M3).

## Stack

Next.js 15 (App Router, RSC) · TypeScript strict · Tailwind CSS 4 + shadcn primitives · PostgreSQL 16 · Prisma 6 · Auth.js v5 (JWT sessions) · Stripe test mode · Vitest · Playwright (from M4).

## M2 — catalog + PDP

- **Listing (`/`)** — 12 per page by default, with `page` and `pageSize` (`12|24|36`) in the URL. Filters are `q`, `category`, `minCents` and `maxCents`, all in the query string. The controls are a plain `GET` form: there is no client component and no client-side filtering.
- **Search** — `websearch_to_tsquery('english', $q)` against the same `to_tsvector('english', name || ' ' || description)` expression as the GIN index, ranked by `ts_rank_cd`, with recency and `p.id` as tie-breakers. No `ILIKE` fallback.
- **Price filters** — applied in SQL to the product's lowest non-archived variant price, which is also the "From" price shown on the card.
- **Product page (`/products/[slug]`)** — variants, SKU, integer cents formatted once by `formatCents`, and stock read from Postgres. The add-to-cart buttons are **deliberately disabled** and labelled as such: M3 wires the `cart_id` cookie and the mutation; pressing one sends no request and writes no row.
- **No session reads** — there is no `auth()` call in `app/layout.tsx` or in either catalog page, so no route is dynamic because of auth.

### Route table (`npx next build`)

```text
Route (app)                                 Size  First Load JS  Revalidate  Expire
┌ ƒ /                                      161 B         106 kB
├ ○ /_not-found                            994 B         104 kB
└ ● /products/[slug]                       161 B         106 kB         30s      1y
```

`/` is **intentionally** `ƒ (Dynamic)`: `searchParams` is the listing's state store, so each filtered URL is rendered on the server per request. In stable Next 15 a page that reads `searchParams` cannot also be static or ISR. Partial Prerendering — a static shell with a per-request filter hole — would express exactly this, but `experimental.ppr` is canary-gated and `next@canary` is 16.x, outside this project's Next 15 constraint. I chose to keep Next 15 and make the dynamic dependency explicit rather than move the filtering to the client. `/products/[slug]` is ISR with `revalidate = 30` (40 paths prerendered by `generateStaticParams`).

**Lighthouse: not measured.** Recorded as unverified rather than guessed at. The app ships no `"use client"` component; the only client JavaScript is Next's framework runtime.

## Data model

Twelve tables. Eight carry the correctness claims — `User`, `Order`, `Variant`, `OrderItem`, `StockReservation`, `Cart`, `CartItem`, `WebhookEvent` — and `Product`, `Category`, `Coupon` plus the single Auth.js adapter table `Account` complete the model.

![Entity relationship diagram](docs/erd.svg)

The diagram is [`docs/erd.svg`](docs/erd.svg). Constraints Prisma cannot express live in the initial migration:

- `CHECK ("stock" >= 0)` on `Variant`
- `CHECK ("percentOff" BETWEEN 0 AND 100)` on `Coupon`
- a GIN index over `to_tsvector('english', name || ' ' || description)` on `Product`

Index choices and real `EXPLAIN ANALYZE` output from this machine: [`docs/WHY-THIS-INDEX.md`](docs/WHY-THIS-INDEX.md).

## Local setup

Requires Node 22 and a local PostgreSQL 16 cluster on port 5433 with trust auth (native install, not Docker).

```bash
cp .env.example .env          # .env is never committed
npm install
npx prisma migrate deploy
npx prisma db seed -- --seed 42
npm run dev
```

`DATABASE_URL` points at `shop_dev`; `TEST_DATABASE_URL` points at `shop_test` and is used only by integration tests and migrate-deploy checks.

`prisma.config.ts` loads `.env` for the Prisma CLI (the CLI no longer does this automatically once a config file exists). If `.env` has not been created yet, it falls back to the local trust-auth URL from `.env.example`, so `npx prisma migrate deploy` works on a fresh checkout.

The seed is deterministic: it truncates and reseeds 40 products (2–3 variants each), 5 categories and one coupon (`SAVE10`). Every id is derived from the seed value and a fixed salt, so two runs with `--seed 42` produce the same ids, counts and SKU set.

## Scripts

| Script | Does |
|---|---|
| `npm run dev` | Next dev server on port 3000 |
| `npm run build` / `start` | production build / serve |
| `npm run lint` | ESLint (flat config, TypeScript strict) |
| `npm run typecheck` | `tsc --noEmit` |
| `npm run test` | Vitest |
| `npm run db:migrate` | `prisma migrate dev` |
| `npm run db:deploy` | `prisma migrate deploy` |
| `npm run db:seed` | `prisma db seed -- --seed 42` |
| `npm run db:drift` | `prisma migrate diff … --exit-code` against the live database |
| `npm run verify` | the M1 gate (below) |

## Verification

`npm run verify` is:

```bash
eslint && tsc --noEmit && vitest run && prisma migrate diff \
  --from-schema-datasource prisma/schema.prisma \
  --to-schema-datamodel prisma/schema.prisma --exit-code
```

The drift step needs `DATABASE_URL` (from your local `.env`, or the fallback in `prisma.config.ts`) and must exit 0.

Tests live in `tests/`:

- `product-card.test.tsx` and `pagination.test.tsx` — component tests rendered with `react-dom/server`; no jsdom.
- `catalog.integration.test.ts` — migrates and seeds `shop_test` with `--seed 42`, then asserts that `"canvas"` ranking is `0.2, 0.2, 0.2, 0.1, 0.1` by `ts_rank_cd` and *not* by recency, and that category/price/pagination execute in SQL.

`tests/setup-env.ts` forces `DATABASE_URL` to `TEST_DATABASE_URL` (or the local `shop_test` URL) before any test module loads, so a test run cannot touch `shop_dev`. The integration test is self-setting-up: it runs `prisma migrate deploy` and the deterministic seed itself.

**Playwright is intentionally not part of `verify` until M4**, when the first E2E tests exist. The full target is documented in the plan: `eslint && tsc --noEmit && vitest run --coverage && prisma migrate diff --exit-code && playwright test`.

`npx next build` runs `generateStaticParams` against Postgres, so it needs `DATABASE_URL` just like `npm run dev`.

## Invariants

Recorded in `CLAUDE.md` and enforced in code as they are implemented; the schema encodes:

1. Money is integer cents everywhere; no float arithmetic, no client-trusted price.
2. `OrderItem` snapshots `sku`, `nameSnapshot`, `unitPriceCents`; history never changes when a product changes.
3. One order per `(userId, idempotencyKey)` — the unique index is the arbiter, and a duplicate returns the existing order.
4. Stock never goes negative — `CHECK (stock >= 0)` is the database backstop; the reservation row is written in the same transaction.
5. Webhook replay is a 200 no-op via `WebhookEvent.stripeEventId`.
6. Amount mismatch becomes `REFUND_REQUIRED`, never `PAID`.
7. Admin "delete" sets `archivedAt`; nothing cascades away order history (`OrderItem.variantId` is `SetNull`).
