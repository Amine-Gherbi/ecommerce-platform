# Proof map

Every README claim maps to a file path and, where a number is quoted, to a
command that was run in this repository. The dated run is 2026-10-23 on
Windows 11 Pro 10.0.26200, Node 22.23.4, PostgreSQL 16.13.

## Gate

```bash
npm run verify
```

`eslint . && tsc --noEmit && vitest run --coverage && prisma migrate diff … --exit-code && playwright test`

**Exit 0**, 2026-10-23 23:05–23:08 local. The abridged transcript is
[`docs/proof/verify.txt`](proof/verify.txt).

| Stage | Result in this run |
| --- | --- |
| ESLint | exit 0 |
| `tsc --noEmit` | exit 0 |
| Vitest | 33 files, 181 tests passed |
| Coverage | statements 92.54 % (2,608/2,818); branches 81.31 % (544/669); functions 100 % (119/119); lines 92.54 % |
| `prisma migrate diff --exit-code` | `No difference detected.` |
| Playwright | 5 tests passed in 2.0 min |

The CI workflow (`.github/workflows/ci.yml`) runs the same command on
`ubuntu-latest` with a `postgres:16` service, and it is green on `master`:
run 40081391256, 2026-10-24, 2 m 28 s. The first two runs failed on workflow
bugs — `psql` and an empty `shop_test` — both fixed and recorded in
[`docs/PIPELINE.md`](PIPELINE.md).

## README claims

| README claim | Evidence |
| --- | --- |
| Next.js 15 / PostgreSQL 16 storefront | `package.json` (`next`, `@prisma/client`); `prisma/schema.prisma:11-14` (`provider = "postgresql"`) |
| Hard problem: 20 concurrent checkouts on stock 5 → exactly 5 orders | `tests/integration/checkout.oversell.test.ts:16-52`; output in [`docs/proof/concurrency-run.txt`](proof/concurrency-run.txt) |
| Demo customer `demo@kestrel.test` / `demo-password-123` | `prisma/seed.ts:906-933`; `tests/e2e/helpers.ts:3-6`; corroborated by the E2E checkout test passing |
| Demo admin `admin@kestrel.test` / `admin-password-123` | same seed rows (`role: "ADMIN"` at `prisma/seed.ts:925-932`); `tests/e2e/admin.spec.ts` |
| `npm run dev` | `package.json` scripts (`"dev": "next dev -p 3000"`) |
| `npm run verify` | `package.json` scripts; transcript above |
| Node 22 + PostgreSQL 16 on port 5433 | `.env.example:3-6`; `package.json` `engines.node >= 22`; `psql --version` → 16.13 |
| Copy `.env.example` to `.env` | `.env.example:1-20` lists every variable the app reads; `.env` is gitignored (`.gitignore`) |
| Seed first with `--seed 42` | `npx prisma db seed -- --seed 42` → `seed=42 categories=4 brands=22 products=30 variants=60 …` |
| Load numbers live in `docs/load/checkout.md` | [`docs/load/checkout.md`](load/checkout.md), produced by `k6 run load/checkout.js` |
| p95 4.58 s, 248/250, 750 HTTP requests | raw k6 summary in `docs/load/checkout.md`; database counts in the same file |
| Payments simulated, `pi_demo_*`, no Stripe key | `src/lib/checkout.ts:279`; no `stripe` import under `src/` (`grep -r "from \"stripe\"" src` → no matches) |
| No live URL | no deployment exists; `git remote -v` is empty; nothing in this repo names a host |
| CI green on `master` | run 40081391256 (2026-10-24); `.github/workflows/ci.yml` |

## Visual identity (P2-R10-theme)

"Cool retail": white paper, cool grey surfaces, one deep teal accent, square
corners, Inter only. Tokens are defined once in `src/app/globals.css` and
consumed through Tailwind utilities; `src/lib/styles.ts` holds the shared
control classes.

| Token | Value | Used for |
| --- | --- | --- |
| `page` | `#ffffff` | body and buy box |
| `surface` | `#f4f6f5` | product cards and PDP tiles, fields, admin nav |
| `surface-strong` | `#e9efec` | reserved stronger grey step (no consumer after P2-R11) |
| `ink` | `#0c0f0e` | body text, footer background |
| `muted` | `#52585a` | secondary text, labels, eyebrows |
| `control` | `#7f8684` | form fields, secondary buttons, option borders |
| `rule` | `#e3e7e5` | dividers and table rules (decorative) |
| `accent` | `#0e5f52` | utility bar, primary buttons, prices, focus ring |
| `accent-ink` | `#ffffff` | text on accent |
| `sale` | `#8a2d1f` | errors and refund states only |

Contrast is computed from the sRGB relative-luminance formula (WCAG 2.2
1.4.3/1.4.11) over the token pairs that actually occur:

| Foreground / background | Ratio | Requirement |
| --- | --- | --- |
| ink `#0c0f0e` on page `#ffffff` | **19.26:1** | body ≥ 4.5:1 |
| ink on surface `#f4f6f5` | **17.75:1** | body ≥ 4.5:1 |
| ink on surface-strong `#e9efec` | **16.53:1** | body ≥ 4.5:1 |
| muted `#52585a` on page | **7.24:1** | body ≥ 4.5:1 |
| muted on surface | **6.67:1** | body ≥ 4.5:1 |
| muted on surface-strong | **6.21:1** | body ≥ 4.5:1 |
| accent `#0e5f52` on page | **7.56:1** | body ≥ 4.5:1; large ≥ 3:1 |
| accent on surface | **6.97:1** | body ≥ 4.5:1 |
| white `#ffffff` on accent (utility bar, primary buttons) | **7.56:1** | body ≥ 4.5:1 |
| surface `#f4f6f5` on ink (footer body) | **17.75:1** | body ≥ 4.5:1 |
| footer-muted `#c3ccc7` on ink | **11.72:1** | body ≥ 4.5:1 |
| sale `#8a2d1f` on page (error text) | **8.48:1** | body ≥ 4.5:1 |
| sale on surface | **7.81:1** | body ≥ 4.5:1 |
| control `#7f8684` on page (field/button boundary) | **3.72:1** | control ≥ 3:1 |
| control on surface | **3.43:1** | control ≥ 3:1 |
| control on surface-strong | **3.19:1** | control ≥ 3:1 |

`rule` (`#e3e7e5` on white, 1.25:1) is used only for non-essential dividers and
never as the only boundary of a control, so 1.4.11 does not apply to it.

Structural proof:

- `rg -n "serif|Iowan|Georgia" src` → no matches (the font stack is
  `Inter, "Segoe UI", system-ui, Arial, Helvetica`).
- `rg -n "#faf9f7|#8c2f18" src` → no matches.
- The 36 px utility bar (`Free delivery over €80 · Ships from Lyon in 1-2
  business days`) and the ink footer render from `src/app/layout.tsx`, so they
  appear on every storefront and admin page; the PDP's duplicate delivery
  sentence was removed (`src/app/p/[slug]/page.tsx`).
- Product-card images are `object-contain` on a `bg-surface` tile with
  `p-4` padding (`lg:p-6` from 1024 px up); the PDP gallery uses the same
  tile, padding and fit for its main image and thumbnails
  (`src/components/store/product-card.tsx`,
  `src/components/store/gallery.tsx`). No border or shadow.

## Photo tiles and secondary text (P2-R11)

The grid and the PDP show the same photograph files, unchanged, with
`object-contain` inside one `surface` tile. Each photo keeps its own room
background, but it is letterboxed inside the same frame instead of being
cover-cropped to a different composition, so a four-up row reads as one
catalogue. Product cards use `p-4`/`lg:p-6`; the gallery main image uses
the same values and its thumbnails use `object-contain p-2`.

Verified visually at 1440x900 and 390x844 CSS px: the four-up grid at 1440
and the two-up grid at 390 both show a uniform tile with the photograph
fully inside it.

`muted` moved from `#63696b` to `#52585a` so small uppercase labels and
secondary lines have headroom above the 4.5:1 floor. Measured with the
sRGB relative-luminance formula (WCAG 2.2 1.4.3), 2026-10-24:

| Element | Pair | Ratio | Requirement |
| --- | --- | --- | --- |
| Product-card brand and sold-out labels | muted `#52585a` on page `#ffffff` | **7.24:1** | ≥ 4.5:1 |
| "Eight recent additions" (13 px uppercase) | muted on page | **7.24:1** | ≥ 4.5:1 |
| Breadcrumbs and secondary meta lines | muted on page | **7.24:1** | ≥ 4.5:1 |
| PDP description and shipping rule | muted on page | **7.24:1** | ≥ 4.5:1 |
| Product-card unavailable text and field hints | muted on surface `#f4f6f5` | **6.67:1** | ≥ 4.5:1 |
| Muted text on the strongest grey step | muted on `#e9efec` | **6.21:1** | ≥ 4.5:1 |
| Footer column headings and legal line | footer-muted `#c3ccc7` on ink `#0c0f0e` | **11.72:1** | ≥ 4.5:1 |

For comparison, the previous `#63696b` measured 5.58:1 on page, 5.14:1 on
surface and 4.79:1 on surface-strong. The hex values are defined once in
`src/app/globals.css`; no route, data or test changed in P2-R11.

## The four checkout invariants

The first four are the checkout invariants from `CLAUDE.md`, restated against
the code that exists after the rebuild.

| # | Invariant | Code | Test |
| --- | --- | --- | --- |
| 1 | Money is integer cents; the client cannot supply a price | `src/lib/checkout.ts:86-107` (`computeTotals` rejects non-integers), `:112-131` (parses only `addressId` and `cartVersion`), `:233` (prices from `Variant.priceCents`); `src/app/api/checkout/route.ts:46-50` | `tests/integration/checkout.forged-price.test.ts:19-87` |
| 2 | `OrderItem` snapshots `sku`, `nameSnapshot`, `unitPriceCents`; product edits never rewrite history | `prisma/schema.prisma:187-200`; `src/lib/checkout.ts:280-287` | `tests/integration/admin.products.test.ts:116-159`, `:161-215` |
| 3 | One order per `(userId, idempotencyKey)`; a duplicate returns the existing order | `src/lib/checkout.ts:133-135`, `:166-176`, `:304-323`; unique index `prisma/schema.prisma:183`; route maps `duplicate` to 200 at `src/app/api/checkout/route.ts:56-59` | `tests/integration/checkout.double-submit.test.ts:16-55` |
| 4 | Stock never goes negative; the reservation is written in the same transaction | `src/lib/checkout.ts:169-303`; conditional `UPDATE … WHERE stock >= ${quantity}` at `:235-244`; reservation rows at `:289-295`; DB `CHECK ("stock" >= 0)` at `prisma/migrations/20261023152658_rebuild/migration.sql:281-283` | `tests/integration/checkout.oversell.test.ts:16-52` |

## Webhook behaviours

The route is `src/app/api/webhooks/payments/route.ts`; the domain logic is
`src/lib/payments-webhook.ts`.

| Behaviour | Code | Test |
| --- | --- | --- |
| Replay is a 200 no-op: one `WebhookEvent`, no second state change | event row inserted first at `src/lib/payments-webhook.ts:112-119`; unique `eventId` at `prisma/schema.prisma:218-228`; duplicate returns at `:214-218`; route answers 200 at `src/app/api/webhooks/payments/route.ts:40-41` | `tests/integration/webhook.replay.test.ts:19-61` |
| Illegal transition logs, answers 200, and never downgrades `PAID` | `src/lib/payments-webhook.ts:161-167` (non-PENDING), `:204-209` (lost compare-and-set) | `tests/integration/webhook.transitions.test.ts:61-81` |
| Unknown PaymentIntent is recorded and answered 200 | `src/lib/payments-webhook.ts:152-159` | `tests/integration/webhook.transitions.test.ts:44-59` |
| Amount or currency mismatch becomes `REFUND_REQUIRED`, never `PAID`, and returns stock | `src/lib/payments-webhook.ts:169-194`; reservation release at `src/lib/reservations.ts:14-45` | `tests/integration/checkout.amount-mismatch.test.ts:19-66` |
| Signature is checked against the raw bytes; unsigned/wrong-signed is the only 400 | `src/app/api/webhooks/payments/route.ts:16-30`; HMAC over `${t}.${rawBody}` at `src/lib/webhook-signature.ts:13-21`, constant-time compare at `:63-90` | `tests/integration/webhook.transitions.test.ts:21-42`; `src/lib/webhook-signature.test.ts` |
| Every classified outcome is 200, never 4xx | `src/lib/payments-webhook.ts:105-220` returns `WebhookResult` for replay, ignored, paid, refund_required and illegal_transition; route answers 200 at `:40-41`. A bad signature is the only 400 (`:28-30`); an unhandled database exception becomes a 500, which is deliberate. | replay, transitions and mismatch tests above |

## Reservation lifecycle

| Behaviour | Code | Test |
| --- | --- | --- |
| The sweeper cancels an expired `PENDING` order and restores stock exactly once | `src/lib/reservations.ts:51-90`; `POST /api/internal/sweep-reservations` at `src/app/api/internal/sweep-reservations/route.ts:9-24` | `tests/integration/reservations.sweeper.test.ts:25-77` |
| A `PAID` order keeps its stock even with a stale reservation | `src/lib/reservations.ts:59` (`order: { status: "PENDING" }`), `:71-75` (compare-and-set) | `tests/integration/reservations.sweeper.test.ts:79-115` |
| Releasing is idempotent: `releasedAt IS NULL` decides which caller restores units | `src/lib/reservations.ts:27-43` | `tests/integration/reservations.sweeper.test.ts:64-77`; `tests/integration/admin.transitions.test.ts:103-147` |

## Other backed claims

| Claim | Test |
| --- | --- |
| A customer cannot read another customer's order | `tests/integration/orders.isolation.test.ts:18-71` |
| Sign-in is rate limited per email + IP after five failures | `src/lib/rate-limit.ts:8-44`; `tests/integration/signin-actions.test.ts:142-220` |
| An anonymous cart merges into the account once, keeping the higher quantity | `tests/integration/cart.merge.test.ts:52-166` |
| Address mutations are scoped to the owner | `tests/integration/addresses-actions.test.ts` |
| Admin order moves are exactly `PENDING→CANCELLED`, `PAID→FULFILLED`, `REFUND_REQUIRED→REFUNDED` | `src/lib/admin-orders.ts:12-16`; `tests/integration/admin.transitions.test.ts` |
| Admin archive sets `Product.status = "ARCHIVED"` and leaves order rows untouched | `src/lib/admin-products.ts:427-467`; `tests/integration/admin.products.test.ts:161-215` |

`CLAUDE.md` describes the archive flag as `archivedAt`. The rebuilt schema has
no such column: the archive state is `ProductStatus.ARCHIVED` on
`Product.status` (`prisma/schema.prisma:21-25`, `:88-106`). The test above is
the behaviour; the column name is not.

## Measurements

### Concurrency

```bash
npx vitest run tests/integration/checkout.oversell.test.ts --reporter=verbose
```

2026-10-23 output:

```text
[proof] 20 concurrent checkouts on stock 5 → 5×201, 15×409, stock=0, openReservations=5
Test Files  1 passed (1)
     Tests  1 passed (1)
```

Transcript: [`docs/proof/concurrency-run.txt`](proof/concurrency-run.txt).

### Checkout load

```bash
node scripts/load-fixture.mjs
k6 run load/checkout.js
```

2026-10-23, 50 VUs × 5 iterations, production `next start`: 250 checkout
requests, 750 HTTP requests, p95 **4.58 s**, 248 orders created, 2 `P2028`
transaction-start timeouts. Method, hardware, raw summary and the database
corroboration (248 orders, 248 open reservations, stock 99,752) are in
[`docs/load/checkout.md`](load/checkout.md).

Test counts and coverage are gate results, not performance claims.

## Not claimed

- **No reconciliation job.** There is no `/api/jobs/reconcile` route and no
  code that polls a payment provider for a webhook that never arrives. The only
  expiry mechanism is the reservation sweeper, which cancels an unpaid
  `PENDING` order after 30 minutes.
- **No live Stripe.** No `stripe` import exists under `src/`; the PaymentIntent
  id is generated locally as `pi_demo_*` (`src/lib/checkout.ts:279`).
- **No deployment, but CI now runs.** The store is a local demo; the workflow is
  green on `master` (run 40081391256). See the Gate section.
