# Deploying on a Node host

There is no deployment in this repository. Nothing below has been executed
against a public host, no URL is claimed, and no platform config (Dockerfile,
fly.toml, Procfile) exists. These are the steps a Node host would need, written
against the code in this tree on 2026-10-23.

## What the host must provide

| Requirement | Why |
| --- | --- |
| Node 22 or newer | `package.json:5-7` (`engines.node >= 22`); the run in this repo used Node 22.23.4 |
| PostgreSQL 16 reachable over TCP | `prisma/schema.prisma:11-14`; the Conditional stock `UPDATE` and `CHECK (stock >= 0)` rely on PostgreSQL semantics |
| Build space for `next build` + ~200 MB `node_modules` | Next 15 production build |
| No C++ toolchain | passwords use `@node-rs/argon2`, which ships prebuilt binaries (`CLAUDE.md` "Pitfalls") |

## Environment

| Variable | Production | Effect if absent |
| --- | --- | --- |
| `DATABASE_URL` | required | Prisma cannot connect; `prisma.config.ts:15` falls back to the local `shop_dev` URL, which will not exist on a host |
| `AUTH_SECRET` (or `NEXTAUTH_SECRET`) | required | `src/auth.ts:16-21` resolves to `undefined` when `NODE_ENV=production`; Auth.js throws instead of signing a session |
| `STRIPE_SECRET_KEY` | required | `src/lib/stripe.ts:72-79` throws before a PaymentIntent is created; checkout answers 500 and no order is written |
| `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY` | required | the checkout page can create the order but shows no card form, because the Payment Element never mounts (`src/app/checkout/checkout-form.tsx`) |
| `STRIPE_WEBHOOK_SECRET` | required | `src/lib/stripe.ts:38-40` returns `null`; the webhook route answers 503 to every delivery (`src/app/api/webhooks/payments/route.ts:16-25`) |
| `SWEEPER_SECRET` | required | `src/app/api/internal/sweep-reservations/route.ts:10-21` answers 503 in production when unset, so expired reservations are never released |
| `TEST_DATABASE_URL` | not used at runtime | Only Vitest/Playwright read it (`tests/setup-env.ts`, `playwright.config.ts:7-9`) |
| `PORT` | optional | `next start` honours it; default 3000 |

Generate the Auth.js secret separately, e.g.
`node -e "console.log(crypto.randomBytes(32).toString('base64'))"`. The local
default in `src/auth.ts:21` is a development-only string and must never reach a
production process. The three Stripe values come from the sandbox dashboard:
the API keys from *Developers → API keys*, and the webhook secret from the
endpoint you create for the host.

## Build and start

```bash
npm ci
npx prisma generate
npx prisma migrate deploy
npm run build
npm start
```

`migrate deploy` applies the four committed migrations in
`prisma/migrations/`, including the `CHECK ("stock" >= 0)` constraint
(`20261023152658_rebuild`) and `Order.paymentIntentId` plus its unique index
(`20261023191000_checkout_payment`). Do not substitute `prisma db push` on a
production database: it reconciles the schema without writing migration
history, so the next `migrate deploy` has no record of what has run. The test
database is the one place `db push` is deliberate (see below).

## Seed

```bash
npx prisma db seed -- --seed 42
```

**This is destructive.** `prisma/seed.ts:802-804` runs
`TRUNCATE … RESTART IDENTITY CASCADE` over every table before inserting the
catalogue and the two demo users. Run it only on a database you intend to
replace, i.e. a demo host. The demo accounts it creates are
`demo@kestrel.test` / `demo-password-123` and
`admin@kestrel.test` / `admin-password-123` (`prisma/seed.ts:906-933`).

## Verify on the host

`npm run verify` is the same gate as CI:
ESLint, `tsc --noEmit`, Vitest with coverage, `prisma migrate diff
--exit-code`, Playwright. It needs more than a running app:

- a second database, `shop_test`, named by `TEST_DATABASE_URL`
  (default `postgresql://postgres@localhost:5433/shop_test`)
- Playwright's browser: `npx playwright install chromium`
- port 3100 free: Playwright starts its own `next dev` there
  (`playwright.config.ts:10`, `:28-38`)

`shop_test` carries no migration history, so the E2E global setup uses
`prisma db push` and then reseeds (`tests/e2e/global-setup.ts:31-32`). That is
intentional; `migrate deploy` against `shop_test` fails.

## Scheduled jobs

The only periodic job is the reservation sweeper. Run it every minute:

```bash
curl -fsS -X POST https://<host>/api/internal/sweep-reservations \
  -H "x-sweeper-secret: $SWEEPER_SECRET"
```

It cancels `PENDING` orders whose reservations expired (30 minutes after
checkout) and restores their stock exactly once
(`src/lib/reservations.ts:51-90`). It is safe to call concurrently: the
`releasedAt IS NULL` compare-and-set decides which caller restores units.

There is no reconciliation job. Nothing polls a payment provider for a webhook
that never arrives; an unpaid order simply expires through the sweeper. If the
provider does deliver late, after the sweep, the event finds a `CANCELLED`
order and is answered 200 `illegal_transition` — it does not resurrect the
order (`src/lib/payments-webhook.ts:135-141`).

## Webhook endpoint

`POST /api/webhooks/payments`, body verified with
`Stripe.webhooks.constructEvent(rawBody, signature, STRIPE_WEBHOOK_SECRET)`.
Stripe sends the signature in `stripe-signature`. The route reads the raw text
before parsing (`src/app/api/webhooks/payments/route.ts:15`) and answers 400
only for a missing or wrong signature; an unconfigured secret answers 503;
every other outcome is 200 so Stripe stops retrying (`:27-48`).

Checkout creates the PaymentIntent after it has repriced the cart and after the
conditional stock decrement, inside the transaction that inserts the order. A
Stripe failure rolls the stock back, so there is no order without an intent
(`src/lib/checkout.ts:273-331`). The Stripe request reuses the checkout
idempotency key, and `metadata.orderId` / `metadata.orderNumber` tie the intent
to the row.

## What this document does not cover

- TLS, reverse proxy, process supervision and log shipping: host-specific and
  not present in the repository.
- Horizontal scaling. The sign-in rate limiter is in-process
  (`src/lib/rate-limit.ts`), so two instances each allow five failures per
  email + IP per minute rather than five in total.
- Backup and restore. Not implemented here.
