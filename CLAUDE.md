# ecommerce-platform (P2) — agent context

Purpose: a storefront whose differentiator is money correctness — server-recomputed totals, one order per checkout attempt under concurrency, reserved (not leaked) stock, idempotent order-agnostic webhooks, and reconciliation for the webhook that never arrives.

## Architecture
- Next.js 15 App Router (RSC), TypeScript strict, Tailwind + shadcn/ui primitives (4 screens, no design system).
- PostgreSQL 16 + Prisma 6. Local dev DB: `shop_dev` / test: `shop_test` on port 5433 (native cluster).
- Auth.js v5 with **JWT** sessions; `src/auth.config.ts` is Edge-safe, `src/auth.ts` is Node-only (Prisma + argon2).
- Checkout: `POST /api/checkout` accepts `{addressId, cartVersion}` only; totals recomputed from `Variant.priceCents`; `idempotencyKey = sha256(cart.id + ':' + cartVersion)`.
- Stock: `UPDATE "Variant" SET stock = stock - $qty WHERE id=$id AND stock >= $qty` inside a transaction, line items sorted by `variantId`; `StockReservation.expiresAt = now() + 30 min`; sweeper releases and cancels.
- Stripe webhook: `runtime = 'nodejs'`, `await req.text()` before any json parse, `dynamic = 'force-dynamic'`, middleware matcher excludes `/api/webhooks`.

## Commands
- `npm run verify` → `eslint && tsc --noEmit && vitest run --coverage && prisma migrate diff --exit-code && playwright test`
- `npm run dev` → 3000 · `npx prisma migrate dev` · `npx prisma db seed -- --seed 42`
- `npm run load` → k6 checkout scenario, output committed to `docs/load/checkout.md`

## Invariants
1. Money is integer cents everywhere; no float arithmetic, no client-trusted price.
2. `OrderItem` snapshots `sku`, `nameSnapshot`, `unitPriceCents`; history never changes when a product changes.
3. One order per `(userId, idempotencyKey)`; duplicate ⇒ return the existing order, not a 409.
4. Stock never goes negative — the migration adds `CHECK (stock >= 0)` and the reservation row is inserted in the same transaction.
5. Webhook: replay ⇒ 200 no-op, illegal transition ⇒ 200 + log. Never 4xx (Stripe retries for 3 days).
6. Amount mismatch ⇒ `REFUND_REQUIRED`, never `PAID`.
7. Admin "delete" sets `archivedAt`; nothing cascades away order history.

## Pitfalls
- Auth.js v5 + Credentials cannot use a DB session: JWT only. Never import `@/auth` in `middleware.ts`.
- Never call `auth()` in `app/layout.tsx` — it makes every route dynamic and kills the Lighthouse target. Read the session in leaf components inside `<Suspense>`.
- Next 15: `params`, `searchParams`, `cookies()` are Promises.
- `argon2` needs node-gyp; use `@node-rs/argon2`.
- 20 concurrent checkouts on stock 5 must yield exactly 5 orders — test it, do not reason about it.

## Decisions
ADRs: `docs/adr/NNNN-*.md`. Invariants: `docs/INVARIANTS.md`. Proof map: `docs/PROOF.md`.
