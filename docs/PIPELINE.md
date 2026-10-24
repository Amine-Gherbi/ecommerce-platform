# Pipeline

## Status: green on master (2026-10-24)

`.github/workflows/ci.yml` runs on `push` to `master`/`main` and on every pull request. It is green on `master`:
run [40081391256](https://github.com/Amine-Gherbi/ecommerce-platform/actions/runs/40081391256),
2026-10-24T09:17:53Z → 09:20:21Z, job `verify`.

The first two runs failed, and both were workflow bugs rather than flakes:

| Run | Failure | Cause | Fix |
| --- | --- | --- | --- |
| 1 | `psql: error: invalid URI query parameter: "schema"` | the step handed Prisma's `DATABASE_URL` to `psql` | connect with `psql -h localhost -U postgres` plus `PGPASSWORD` |
| 2 | `relation "WebhookEvent" does not exist` | `shop_test` was empty: Vitest runs before Playwright's global setup | `prisma migrate deploy` on `shop_dev`, `prisma db push` on `shop_test` |

Local evidence is recorded in [`docs/PROOF.md`](PROOF.md); the run URL above is the CI evidence.

## What runs

One job, `verify`, on `ubuntu-latest`, with a `postgres:16` service container.
The step list is deliberately short; the gate itself is one command so the
local and CI definitions cannot drift.

| Step | What it proves |
| --- | --- |
| `actions/checkout` | the exact commit is what runs |
| `actions/setup-node` (Node 22, npm cache) | the engine in `package.json` is the runtime |
| `psql -h localhost -U postgres ... CREATE DATABASE shop_test` | the test database exists next to `shop_dev` |
| `npm ci` | dependencies come from `package-lock.json`, not a floating install |
| `npx prisma migrate deploy` | `shop_dev` carries the committed migrations before the drift check |
| `npx playwright install --with-deps chromium` | the E2E browser exists; no test silently skips |
| `DATABASE_URL=$TEST_DATABASE_URL npx prisma db push` | `shop_test` has the schema Vitest truncates |
| `npm run verify` | the whole gate, with no `continue-on-error` and no `\|\| true` |

`npm run verify` is:

```text
eslint . && tsc --noEmit && vitest run --coverage
  && prisma migrate diff --from-schema-datasource prisma/schema.prisma
       --to-schema-datamodel prisma/schema.prisma --exit-code
  && playwright test
```

- **eslint** — flat config, TypeScript strict.
- **tsc --noEmit** — no `any` escapes; `noUncheckedIndexedAccess` is on.
- **vitest run --coverage** — unit + Postgres integration suites against
  `shop_test`; the 70 % line/function/statement floor applies to `src/lib/**`
  and to `src/app/**/actions.ts` (`vitest.config.ts:25-38`). The 2026-10-23 run:
  33 files, 181 tests, 92.54 % statements (`docs/proof/verify.txt`).
- **prisma migrate diff --exit-code** — 0 clean, 2 drift, 1 error. Drift is a
  failure, not a warning. It compares the database named by `DATABASE_URL` with
  `prisma/schema.prisma`, so that database must already be migrated. The workflow
  runs `prisma migrate deploy` against `shop_dev` before the gate, and the step
  passes on the runner (run 40081391256).
- **playwright test** — four browser specs, five tests:
  `admin.spec.ts` (an admin fulfils a paid order; a customer is redirected out
  of `/admin`), `auth.spec.ts` (a wrong password stays on the form),
  `checkout.spec.ts` (browse → cart → sign in → order at the server total) and
  `signup.spec.ts` (create an account and land on `/account`). The E2E server
  runs on port 3100 against `shop_test`, reseeded deterministically by
  `tests/e2e/global-setup.ts`.

## Deliberate details

- **Actions pinned to full commit SHAs.** `actions/checkout@11bd719…` (v4.2.2)
  and `actions/setup-node@1e60f62…` (v4.0.4). A moving tag on a workflow that
  touches a database is a supply-chain hole, not a convenience.
- **`permissions:` is written out.** Top level is `contents: read`; the job
  repeats it rather than inheriting an implicit default.
- **Concurrency is per branch.** `${{ github.workflow }}-${{ github.ref }}`
  with `cancel-in-progress: true`, so a second push to the same branch cancels
  the older run instead of racing it for the database service.
- **The workflow mirrors verify, it does not extend it.** There is no separate
  lint job and no matrix. Eight named jobs would make a required-check ruleset
  fragile; this repository has one check name to require.

## Local reproduction (optional)

The reviewer does not need this. If you want to run the gate yourself:

```bash
cp .env.example .env                          # PostgreSQL 16 on port 5433
npm ci
npx playwright install chromium               # once per machine
npm run verify
```

`npm run verify` uses `shop_test` for Vitest and Playwright and needs the local
PostgreSQL cluster. `DATABASE_URL` is read from `.env` for the drift check.

## What is intentionally not in CI

- **k6.** The load report in [`docs/load/checkout.md`](load/checkout.md) is a
  measurement of this machine, not a CI gate. A shared runner's CPU is not the
  reviewer's CPU, and a threshold on either would be a number about the runner.
- **Asset capture.** `npm run assets` runs
  `scripts/capture-screenshots.mjs`, which needs a server on port 3000 and
  writes to `../_shared/assets/ecommerce-platform`, outside this repository. A
  workflow cannot write the hub's snapshot, and should not try.
- **Stripe.** There is no Stripe integration to exercise: payments are
  simulated, checkout writes a `pi_demo_*` id, and the webhook suites sign
  their own fixtures. The workflow sets only `AUTH_SECRET` and the two database
  URLs (`.github/workflows/ci.yml:45-49`).
