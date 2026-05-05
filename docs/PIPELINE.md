# Pipeline

## Status: defined, never executed

`.github/workflows/ci.yml` is committed. **It has never run.** This repository
has no git remote (`git remote -v` prints nothing), so there is no GitHub
Actions runner, no run URL, no badge claim, and no green check to point at.
What exists is the workflow file and a local transcript of the same command:
`npm run verify` exits 0 on this machine (Windows 11, Node 22.23.4, PostgreSQL
16.13). Local evidence is recorded in [`docs/PROOF.md`](PROOF.md); CI evidence
does not exist yet.

When the repo is pushed to a remote, the workflow runs on `push` to `main` or
`master` and on every pull request. Until then, treat "CI is green" as false.

## What would run

One job, `verify`, on `ubuntu-latest`, with a `postgres:16` service container.
The step list is deliberately short; the gate itself is one command so the
local and CI definitions cannot drift.

| Step | What it proves |
| --- | --- |
| `actions/checkout` | the exact commit is what runs |
| `actions/setup-node` (Node 22, npm cache) | the engine in `package.json` is the runtime |
| `psql ... CREATE DATABASE shop_test` | the test database exists next to `shop_dev` |
| `npm ci` | dependencies come from `package-lock.json`, not a floating install |
| `npx playwright install --with-deps chromium` | the E2E browser exists; no test silently skips |
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
  `prisma/schema.prisma`, so that database must already be migrated. The
  workflow creates `shop_dev` but does not run `prisma migrate deploy`; since
  the workflow has never executed, whether that step passes there is untested.
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
