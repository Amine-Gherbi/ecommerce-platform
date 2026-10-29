# syntax=docker/dockerfile:1.7

# --- dependencies -----------------------------------------------------------
# All dependencies, including the build-time and release-only ones. The runner
# never gets this whole tree: `next build` emits the standalone subset, and the
# Prisma CLI plus `tsx` are installed separately in the release directory.
FROM node:22-alpine AS deps
WORKDIR /app
RUN apk add --no-cache openssl
COPY package.json package-lock.json ./
RUN npm ci

# --- build ------------------------------------------------------------------
FROM node:22-alpine AS builder
WORKDIR /app
RUN apk add --no-cache openssl
COPY --from=deps /app/node_modules ./node_modules
COPY . .

# NEXT_PUBLIC_* values are inlined into the client bundle by `next build`.
# Passing this only at `docker run` time produces a checkout page whose
# Payment Element can never mount, because `checkout-form.tsx` reads the value
# at build time. Rebuild the image when the key changes.
ARG NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY=""
ENV NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY=$NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY
ENV NEXT_TELEMETRY_DISABLED=1

RUN npx prisma generate
RUN npm run build

# --- runtime ----------------------------------------------------------------
FROM node:22-alpine AS runner
WORKDIR /app

ENV NODE_ENV=production \
    NEXT_TELEMETRY_DISABLED=1 \
    HOSTNAME=0.0.0.0 \
    PORT=3000

RUN apk add --no-cache openssl \
    && addgroup -S -g 1001 nodejs \
    && adduser -S -u 1001 -G nodejs nextjs

# Standing Next output: server.js + traced node_modules.
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static
COPY --from=builder --chown=nextjs:nodejs /app/public ./public

# Release assets. `prisma migrate deploy` needs the schema + migrations and the
# CLI; `prisma db seed` needs the seed, the one domain module it imports, and a
# TypeScript runner. All of it lives in the image, so the release step does not
# depend on a build stage that has already been discarded.
COPY --from=builder --chown=nextjs:nodejs /app/prisma ./prisma
COPY --from=builder --chown=nextjs:nodejs /app/prisma.config.ts ./prisma.config.ts
COPY --from=builder --chown=nextjs:nodejs /app/tsconfig.json ./tsconfig.json
COPY --from=builder --chown=nextjs:nodejs /app/src/lib/money.ts ./src/lib/money.ts
COPY --chown=nextjs:nodejs docker-entrypoint.sh ./docker-entrypoint.sh
RUN chmod +x ./docker-entrypoint.sh

# The Prisma CLI and tsx are devDependencies, so the standalone trace does not
# include them. Install a self-contained copy under /opt/release and expose it
# through /app/node_modules so `prisma db seed`'s configured command
# (`node --import tsx prisma/seed.ts`) resolves. The generated Prisma client in
# the standalone trace is the one the seed uses.
RUN mkdir -p /opt/release \
    && cd /opt/release \
    && npm init -y > /dev/null \
    && npm install --no-save --no-package-lock prisma@6.19.3 tsx@4.23.15 \
    && mkdir -p /app/node_modules/.bin \
    && ln -sfn /opt/release/node_modules/prisma /app/node_modules/prisma \
    && ln -sfn /opt/release/node_modules/tsx /app/node_modules/tsx \
    && ln -sfn /opt/release/node_modules/esbuild /app/node_modules/esbuild \
    && ln -sf /opt/release/node_modules/.bin/prisma /app/node_modules/.bin/prisma \
    && ln -sf /opt/release/node_modules/.bin/tsx /app/node_modules/.bin/tsx

USER nextjs

EXPOSE 3000

# No auth and no session: the health route pings PostgreSQL with `SELECT 1`.
HEALTHCHECK --interval=30s --timeout=5s --start-period=40s --retries=3 \
  CMD wget -qO- "http://127.0.0.1:${PORT:-3000}/api/health" > /dev/null || exit 1

ENTRYPOINT ["./docker-entrypoint.sh"]
CMD ["node", "server.js"]
