# Deploying the storefront

The deploy artefacts are in this repository; **no Render service has been
created and no public URL is claimed**. W1-c creates the service and records
the URL, the order number and the PaymentIntent id in [`PROOF.md`](PROOF.md).
This document describes the image, the blueprint and the release step those
artefacts produce.

## The image

`Dockerfile` is a three-stage build on `node:22-alpine`:

| Stage | What it does |
| --- | --- |
| `deps` | `npm ci` from the lockfile, including the build and release tooling |
| `builder` | `prisma generate`, then `next build` with `output: "standalone"` |
| `runner` | `server.js` + the traced `node_modules`, `public/`, `.next/static`, the Prisma schema/migrations/seed, and a release-only Prisma CLI + `tsx` |

The container:

- runs as `nextjs`, uid **1001** (`docker run --rm store:w1b id`);
- sets `NODE_ENV=production`;
- answers `GET /api/health` without a session. The route runs `SELECT 1`, so a
  container whose database is unreachable is unhealthy, not merely listening;
- starts through `docker-entrypoint.sh`, which runs the release step once per
  container start (see below) and then `exec`s `node server.js`;
- exposes `HEALTHCHECK` every 30 s against the same route.

The build needs **no database**. `src/app/layout.tsx` sets
`dynamic = "force-dynamic"`, so every page is rendered per request rather than
prerendered: the header reads the live category list, and the home page shows
live prices and stock. `next build` therefore succeeds on a build host with no
`DATABASE_URL`, and the image never contains catalogue HTML captured at build
time. The cost is a server render per request; for a store whose stock changes
under it, that is the correct trade. The release step runs migrations after the
image exists, so a fresh Neon database cannot deadlock the first build.

Build it with the publishable key as a **build argument**:

```bash
docker build \
  --build-arg NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY=<publishable-key> \
  -t store:w1b .
```

`NEXT_PUBLIC_*` is not a runtime setting. Next inlines the value while
`next build` compiles `src/app/checkout/checkout-form.tsx`; the browser bundle
that mounts the Payment Element contains the literal from build time. A
container started with the key only in its runtime environment serves a
checkout page whose Payment Element never mounts. Changing the key requires a
new image. Confirm the inlining before shipping:

```bash
docker run --rm --entrypoint sh store:w1b -c \
  "grep -rl '<the same key>' .next/static .next/server | head"
```

Render translates a Docker service's environment variables into Docker build
arguments automatically. `render.yaml` therefore declares
`NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY` (with `sync: false`) and the Dockerfile
declares the matching `ARG`; the value reaches the build without being
committed. Do not declare an `ARG` for `STRIPE_SECRET_KEY`, `DATABASE_URL` or
any other secret: Render would pass it into the image.

## The release step

`npm run release` is:

```bash
prisma migrate deploy && prisma db seed -- --seed 42 --if-empty
```

It is **idempotent by design**:

- `prisma migrate deploy` applies only the migrations in
  `prisma/migrations/` that the database has not recorded. It does not use
  `db push`; the drift check in `npm run verify` is the guard against a schema
  that no migration describes.
- The seed is non-destructive when `--if-empty` is set **or**
  `NODE_ENV=production`. Once a product or user row exists it prints
  `seed=42 skipped=1 reason=already-populated …` and exits 0. Without that
  guard the seed's `TRUNCATE … RESTART IDENTITY CASCADE` would erase orders,
  which invariant 7 forbids.

The Prisma CLI is a devDependency and is not in the standalone trace, so the
runner installs a self-contained copy under `/opt/release` and links `prisma`
and `tsx` into `/app/node_modules`. The seed therefore runs in the runtime
layer with no build stage and no network access beyond the database.

Prove the idempotency on a scratch database:

```bash
createdb shop_release_check
DATABASE_URL=postgresql://postgres@localhost:5433/shop_release_check \
  npx prisma migrate deploy
DATABASE_URL=postgresql://postgres@localhost:5433/shop_release_check \
  npm run release
DATABASE_URL=postgresql://postgres@localhost:5433/shop_release_check \
  npm run release          # prints skipped=1, exit 0
```

Compare `count(*)` for `Product`, `Variant`, `User`, `Order` after each run;
the numbers do not change on the second run. The same command can be run
inside the image (the image has `prisma`, `tsx`, the seed and `public/`):

```bash
docker run --rm -e DATABASE_URL=<scratch-url> store:w1b npm run release
```

### Why the entrypoint, not `preDeployCommand`

Render's [deploy documentation](https://render.com/docs/deploys#pre-deploy-command)
states that the pre-deploy command is available for **paid** web services,
private services and background workers. The blueprint targets the free plan,
so `render.yaml` does not set `preDeployCommand`; the image's entrypoint runs
`npm run release` before `node server.js`. That is safe on every cold start
because both halves are idempotent. If the service is later moved to a paid
plan, add `preDeployCommand: npm run release` and set
`SKIP_RELEASE_ON_START` (or remove the entrypoint call) to avoid running it
twice.

## The Render blueprint

`render.yaml` defines one free Docker web service:

| Setting | Value | Why |
| --- | --- | --- |
| `name` | `kestrel-store` | the service the W1-c card deploys |
| `runtime` | `docker` | the image above |
| `healthCheckPath` | `/api/health` | unauthenticated, database-backed |
| `autoDeployTrigger` | `off` | deploys are explicit; the demo lane depends on it |
| `plan` | `free` | the only plan this project uses |
| `DATABASE_URL` | `sync: false` | the Neon pooled string is pasted in the dashboard, never committed |
| `AUTH_SECRET` | `generateValue: true` | Render generates the JWT signing secret |
| `PAYMENTS_WEBHOOK_SECRET` | `generateValue: true` | the card's name for the payment webhook secret; see below |
| `SWEEPER_SECRET` | `generateValue: true` | the scheduled workflow's shared secret |
| `STRIPE_SECRET_KEY` | `sync: false` | server-side key, pasted in the dashboard |
| `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY` | `sync: false` | public, but needed at **build** time (above) |

The application's original variable name is `STRIPE_WEBHOOK_SECRET`
(`src/lib/stripe.ts`). It accepts `PAYMENTS_WEBHOOK_SECRET` as an alias, which
is why the blueprint can use the card's name. **The generated value is a
placeholder, not a Stripe signing secret:** in W1-c, replace it with the
"Signing secret" shown for the endpoint
`https://<store>/api/webhooks/payments`, otherwise every delivery is rejected
(fail closed, 503/400). `SWEEPER_SECRET` must be copied to the
`SWEEPER_SECRET` GitHub Actions secret so the scheduled workflow can call the
endpoint.

`DATABASE_URL` is a Neon **pooled** connection string ending in
`?sslmode=require`. The database lives on Neon, not on Render: Render's free
Postgres expires after 30 days.

### Free-plan behaviour that affects measurements

- The service spins down after 15 minutes idle and takes about a minute to
  wake. Warm it with a request before Lighthouse, k6 or any smoke measurement,
  and say "free instance, cold start ~60 s" in the write-up.
- Four services are planned against 750 free instance hours per month; do not
  add a keep-alive pinger.
- The pre-deploy command and cron jobs are not part of the free plan. The
  entrypoint is the release step; the sweeper runs from GitHub Actions (see
  [`OPERATIONS.md`](OPERATIONS.md)).

## Scheduled sweeper

`POST /api/internal/sweep-reservations` remains authenticated by
`x-sweeper-secret`. Because Render cron jobs are not available on the free
plan, `.github/workflows/sweep-reservations.yml` calls it hourly. The cadence
arithmetic and the read-path expiry guarantee are in
[`OPERATIONS.md`](OPERATIONS.md#scheduled-trigger).

## Verify on the host

`npm run verify` is the same gate as CI: ESLint, `tsc --noEmit`, Vitest with
coverage, `prisma migrate diff --exit-code`, Playwright. It needs:

- a second database, `shop_test`, named by `TEST_DATABASE_URL`
  (default `postgresql://postgres@localhost:5433/shop_test`);
- Playwright's Chromium (`npx playwright install chromium`);
- port 3100 free: Playwright starts its own `next dev` there.

`shop_test` carries no migration history, so the E2E global setup uses
`prisma db push` and then reseeds. That is intentional; `migrate deploy`
against `shop_test` fails. The pre-deploy check against a real environment is
`npm run release` (above), and the container's `/api/health` must answer 200.

## What this document does not cover

- Creating the Render service, pasting the Neon and Stripe values, and
  pointing the Stripe webhook at the deployed URL: W1-c.
- TLS, reverse proxying and log shipping: Render provides the first; the last
  two are not configured here.
- Horizontal scaling. Sign-in rate limiting is in-process
  (`src/lib/rate-limit.ts`); the release step assumes one instance at a time.
- Backup and restore. Take a `pg_dump` before the first `migrate deploy` on a
  database that holds anything you care about.
