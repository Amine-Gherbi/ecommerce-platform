#!/usr/bin/env node
// Builds the fixture consumed by load/checkout.js.
//
//   node scripts/load-fixture.mjs            # 250 users, 250 carts, LOAD-001
//   node scripts/load-fixture.mjs --cleanup  # remove every load row
//
// Each user owns one address and one cart holding one unit of LOAD-001. The
// accounts are used exactly once per run, so every checkout is a real order
// creation and never an idempotent replay. Reruns clean first, so the number
// of users in the fixture always matches the number of accounts created.
//
// The script talks to the same database the dev server uses. NEXT does not
// load `.env` for a plain node process, so DATABASE_URL is read from the
// environment and otherwise defaults to the documented local `shop_dev`.

import { createHash } from "node:crypto";
import { writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { hash } from "@node-rs/argon2";
import { PrismaClient } from "@prisma/client";

const DATABASE_URL =
  process.env.DATABASE_URL ??
  "postgresql://postgres@localhost:5433/shop_dev?schema=public";
const BASE_URL = process.env.BASE_URL ?? "http://127.0.0.1:3000";

const USER_COUNT = Number(process.env.LOAD_USERS ?? "250");
const PASSWORD = "load-password-123";
const PRICE_CENTS = 1_999;
// 1 999 < the 8 000 free-shipping threshold, so standard shipping is 490.
const SHIPPING_CENTS = 490;
const TOTAL_CENTS = PRICE_CENTS + SHIPPING_CENTS;
const STOCK = 100_000;
const SKU = "LOAD-001";
const EMAIL_DOMAIN = "kestrel.test";
const EMAIL_PREFIX = "load-";

const here = dirname(fileURLToPath(import.meta.url));
const fixturePath = resolve(here, "..", "load", "fixture.json");

const prisma = new PrismaClient({ datasources: { db: { url: DATABASE_URL } } });

function emailFor(index) {
  return `${EMAIL_PREFIX}${index}@${EMAIL_DOMAIN}`;
}

// Must match `cartVersion` in src/lib/checkout.ts: sha256 of
// `<variantId>:<quantity>` lines sorted by variantId.
function cartVersion(variantId, quantity) {
  return createHash("sha256")
    .update(`${variantId}:${quantity}`)
    .digest("hex");
}

async function cleanup() {
  const loadUser = `"userId" IN (
    SELECT id FROM "User" WHERE email LIKE '${EMAIL_PREFIX}%@${EMAIL_DOMAIN}'
  )`;

  await prisma.$transaction(async (tx) => {
    await tx.$executeRawUnsafe(
      `DELETE FROM "StockReservation" WHERE "orderId" IN (
         SELECT id FROM "Order" WHERE ${loadUser}
       )`,
    );
    await tx.$executeRawUnsafe(
      `DELETE FROM "OrderItem" WHERE "orderId" IN (
         SELECT id FROM "Order" WHERE ${loadUser}
       )`,
    );
    await tx.$executeRawUnsafe(`DELETE FROM "Order" WHERE ${loadUser}`);
    await tx.$executeRawUnsafe(
      `DELETE FROM "AuditLog" WHERE "actorId" IN (
         SELECT id FROM "User" WHERE email LIKE '${EMAIL_PREFIX}%@${EMAIL_DOMAIN}'
       )`,
    );
    await tx.$executeRawUnsafe(
      `DELETE FROM "CartItem" WHERE "cartId" IN (
         SELECT id FROM "Cart" WHERE ${loadUser}
       )`,
    );
    await tx.$executeRawUnsafe(`DELETE FROM "Cart" WHERE ${loadUser}`);
    await tx.$executeRawUnsafe(`DELETE FROM "Address" WHERE ${loadUser}`);
    await tx.$executeRawUnsafe(
      `DELETE FROM "User" WHERE email LIKE '${EMAIL_PREFIX}%@${EMAIL_DOMAIN}'`,
    );

    // The probe product cascades to its images and variants.
    await tx.$executeRawUnsafe(`DELETE FROM "Product" WHERE slug = 'load-probe'`);
    await tx.$executeRawUnsafe(`DELETE FROM "Category" WHERE slug = 'load'`);
    await tx.$executeRawUnsafe(`DELETE FROM "Brand" WHERE slug = 'load'`);
  });
}

async function build() {
  if (!Number.isInteger(USER_COUNT) || USER_COUNT < 1) {
    throw new Error(`LOAD_USERS must be a positive integer, got ${USER_COUNT}`);
  }

  await cleanup();

  const brand = await prisma.brand.create({
    data: { name: "Load Test", slug: "load" },
  });
  const category = await prisma.category.create({
    data: { name: "Load Test", slug: "load", position: 10_000 },
  });
  const product = await prisma.product.create({
    data: {
      slug: "load-probe",
      title: "Load Probe",
      brandId: brand.id,
      categoryId: category.id,
      description: "Synthetic product used only by scripts/load-fixture.mjs.",
      specs: {},
      status: "ACTIVE",
      variants: {
        create: {
          sku: SKU,
          title: "One",
          priceCents: PRICE_CENTS,
          stock: STOCK,
          position: 0,
        },
      },
    },
    include: { variants: true },
  });

  const variant = product.variants[0];
  if (variant === undefined) {
    throw new Error("load product has no variant");
  }

  // One hash for every account: same password, and hashing 250 times would
  // dominate the fixture run.
  const passwordHash = await hash(PASSWORD);
  const users = [];

  for (let index = 0; index < USER_COUNT; index += 1) {
    const email = emailFor(index);
    const user = await prisma.user.create({
      data: { email, passwordHash, name: `Load User ${index}`, role: "CUSTOMER" },
      select: { id: true },
    });
    const address = await prisma.address.create({
      data: {
        userId: user.id,
        label: "Load",
        line1: `${index + 1} Load Street`,
        city: "Lyon",
        postalCode: "69001",
        country: "France",
        isDefault: true,
      },
      select: { id: true },
    });
    await prisma.cart.create({
      data: {
        userId: user.id,
        deliveryMethod: "STANDARD",
        items: { create: { variantId: variant.id, quantity: 1 } },
      },
    });

    users.push({
      email,
      addressId: address.id,
      cartVersion: cartVersion(variant.id, 1),
    });
  }

  const fixture = {
    generatedAt: new Date().toISOString(),
    baseUrl: BASE_URL,
    priceCents: PRICE_CENTS,
    shippingCents: SHIPPING_CENTS,
    totalCents: TOTAL_CENTS,
    password: PASSWORD,
    sku: SKU,
    users,
  };
  writeFileSync(fixturePath, `${JSON.stringify(fixture, null, 2)}\n`, "utf8");

  console.log(
    `load fixture: users=${users.length} sku=${SKU} priceCents=${PRICE_CENTS} shippingCents=${SHIPPING_CENTS} totalCents=${TOTAL_CENTS} stock=${STOCK} baseUrl=${BASE_URL}`,
  );
  console.log(`wrote ${fixturePath}`);
}

async function main() {
  if (process.argv.includes("--cleanup")) {
    await cleanup();
    console.log("load fixture: removed all load users, orders and the LOAD-001 product");
    return;
  }
  await build();
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
