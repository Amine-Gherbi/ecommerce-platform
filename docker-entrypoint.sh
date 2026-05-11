#!/bin/sh
# Release step for every container start.
#
# Render's `preDeployCommand` is documented as available for paid web services
# only, and this blueprint targets the free plan, so the migration + seed step
# lives here instead. Both halves are idempotent:
#   * `prisma migrate deploy` applies only unapplied migrations;
#   * the seed is invoked with `--if-empty` and does nothing once rows exist.
# A cold start, a restart or a second deploy is therefore safe. The seed also
# runs in non-destructive mode when NODE_ENV=production even if the flag is
# lost, so a forgotten argument cannot truncate order history.
set -eu

npm run release

exec "$@"
