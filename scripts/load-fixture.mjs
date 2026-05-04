#!/usr/bin/env node
/**
 * Prepares deterministic load-test data against the *development* database.
 *
 *   node scripts/load-fixture.mjs            # create 250 users, one cart each
 *   node scripts/load-fixture.mjs --cleanup  # remove the same fixture
 *
 * Each user owns one cart holding one unit of the load variant, so every
 * checkout in load/checkout.js is a unique (userId, idempotencyKey) and a real
 * 201 — not an idempotent replay. `load/fixture.json` is generated and
 * gitignored; it contains only local test credentials.
 */
import { createHash, randomUUID } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

import { hash } from "@node-rs/argon2";
import { PrismaClient } from "@prisma/client";

const USERS = Number(process.env.LOAD_USERS ?? "250");
const PASSWORD = "load-password-123";
const EMAIL_PREFIX = "load-";
const CATEGORY_SLUG = "load-test";
const PRODUCT_SLUG = "load-test-item";
const SKU = "LOAD-001";
const PRICE_CENTS = 1_999;
const STOCK = 100_000;

if (process.env.DATABASE_URL === undefined) {
  process.loadEnvFile(".env");
}

const prisma = new PrismaClient();

/** Same canonical form as `cartVersionOf` in src/lib/checkout.ts. */
function cartVersionOf(variantId, quantity) {
  return createHash("sha256")
    .update(`${variantId}:${quantity}`, "utf8")
    .digest("hex");
}

async function cleanup() {
  const users = await prisma.user.findMany({
    where: { email: { startsWith: EMAIL_PREFIX } },
    select: { id: true },
  });
  const userIds = users.map((user) => user.id);

  if (userIds.length > 0) {
    const orders = await prisma.order.findMany({
      where: { userId: { in: userIds } },
      select: { id: true },
    });
    const orderIds = orders.map((order) => order.id);

    if (orderIds.length > 0) {
      await prisma.stockReservation.deleteMany({
        where: { orderId: { in: orderIds } },
      });
      await prisma.orderItem.deleteMany({
        where: { orderId: { in: orderIds } },
      });
      await prisma.order.deleteMany({ where: { id: { in: orderIds } } });
    }
    await prisma.cart.deleteMany({ where: { userId: { in: userIds } } });
    await prisma.user.deleteMany({ where: { id: { in: userIds } } });
  }

  const product = await prisma.product.findUnique({
    where: { slug: PRODUCT_SLUG },
    select: { id: true },
  });
  if (product !== null) {
    await prisma.variant.deleteMany({ where: { productId: product.id } });
    await prisma.product.delete({ where: { id: product.id } });
  }
  await prisma.category.deleteMany({ where: { slug: CATEGORY_SLUG } });

  return { users: userIds.length };
}

async function main() {
  const removed = await cleanup();

  const category = await prisma.category.create({
    data: { id: randomUUID(), slug: CATEGORY_SLUG, name: "Load Test" },
  });
  const product = await prisma.product.create({
    data: {
      id: randomUUID(),
      slug: PRODUCT_SLUG,
      name: "Load Test Item",
      description: "Fixture product for the k6 checkout run.",
      categoryId: category.id,
    },
  });
  const variant = await prisma.variant.create({
    data: {
      id: randomUUID(),
      productId: product.id,
      sku: SKU,
      name: "Default",
      priceCents: PRICE_CENTS,
      stock: STOCK,
    },
  });

  const passwordHash = await hash(PASSWORD);
  const cartVersion = cartVersionOf(variant.id, 1);
  const now = Date.now();
  const users = Array.from({ length: USERS }, (_, index) => ({
    id: randomUUID(),
    email: `${EMAIL_PREFIX}${index}@alder.test`,
    passwordHash,
    name: `Load User ${index}`,
  }));

  await prisma.user.createMany({ data: users });
  await prisma.cart.createMany({
    data: users.map((user) => ({
      id: randomUUID(),
      userId: user.id,
      expiresAt: new Date(now + 24 * 60 * 60 * 1_000),
    })),
  });

  const carts = await prisma.cart.findMany({
    where: { userId: { in: users.map((user) => user.id) } },
    select: { id: true, userId: true },
  });
  const cartByUser = new Map(carts.map((cart) => [cart.userId, cart.id]));
  await prisma.cartItem.createMany({
    data: users.map((user) => ({
      id: randomUUID(),
      cartId: cartByUser.get(user.id),
      variantId: variant.id,
      quantity: 1,
    })),
  });

  const fixture = {
    baseUrl: process.env.LOAD_BASE_URL ?? "http://127.0.0.1:3000",
    password: PASSWORD,
    variantId: variant.id,
    priceCents: PRICE_CENTS,
    users: users.map((user, index) => ({
      email: user.email,
      cartVersion,
      addressId: `load-address-${index}`,
    })),
  };

  const output = path.resolve("load", "fixture.json");
  await mkdir(path.dirname(output), { recursive: true });
  await writeFile(output, `${JSON.stringify(fixture, null, 2)}\n`, "utf8");

  console.log(
    `[load-fixture] recreated fixture: removed ${removed.users} users, wrote ${USERS} users to ${output}`,
  );
}

try {
  if (process.argv.includes("--cleanup")) {
    const removed = await cleanup();
    console.log(`[load-fixture] removed ${removed.users} load users`);
  } else {
    await main();
  }
} finally {
  await prisma.$disconnect();
}
