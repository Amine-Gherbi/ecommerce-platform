// Shared fixtures for the checkout proof scripts. These scripts talk to a
// running Next server over HTTP; the only direct database access is fixture
// setup and the verification queries they print.

import { createHash, randomUUID } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

import { PrismaClient } from "@prisma/client";
import { hash } from "@node-rs/argon2";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");

function loadEnvFile() {
  if (process.env.DATABASE_URL) {
    return;
  }
  const file = path.join(root, ".env");
  for (const line of fs.readFileSync(file, "utf8").split(/\r?\n/)) {
    if (line.length === 0 || line.startsWith("#")) {
      continue;
    }
    const eq = line.indexOf("=");
    if (eq === -1) {
      continue;
    }
    const key = line.slice(0, eq).trim();
    let value = line.slice(eq + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    if (process.env[key] === undefined) {
      process.env[key] = value;
    }
  }
}

loadEnvFile();

export const PASSWORD = "demo-password-123";
export const FREE_SHIPPING_THRESHOLD_CENTS = 8_000;
export const SHIPPING_CENTS = 490;

export const db = new PrismaClient();

let cachedPasswordHash = null;
export async function demoPasswordHash() {
  cachedPasswordHash ??= await hash(PASSWORD);
  return cachedPasswordHash;
}

export function cartVersion(lines) {
  const canonical = [...lines]
    .sort((a, b) => (a.variantId < b.variantId ? -1 : a.variantId > b.variantId ? 1 : 0))
    .map((line) => `${line.variantId}:${line.quantity}`)
    .join("\n");
  return createHash("sha256").update(canonical).digest("hex");
}

export function idempotencyKey(cartId, version) {
  return createHash("sha256").update(`${cartId}:${version}`).digest("hex");
}

export async function seedProduct({ priceCents, stock }) {
  const suffix = randomUUID();
  const category = await db.category.create({
    data: { slug: `demo-category-${suffix}`, name: "Demo", position: 0 },
  });
  const brand = await db.brand.create({
    data: { slug: `demo-brand-${suffix}`, name: "Demo Brand" },
  });
  const sku = `DEMO-${suffix.slice(0, 8).toUpperCase()}`;
  const product = await db.product.create({
    data: {
      slug: `demo-product-${suffix}`,
      title: "Proof Headphones",
      brandId: brand.id,
      categoryId: category.id,
      description: "Fixture product for the checkout proof scripts.",
      specs: {},
      status: "ACTIVE",
      variants: {
        create: {
          sku,
          title: "Standard",
          priceCents,
          stock,
          position: 0,
        },
      },
    },
    include: { variants: true },
  });

  const variant = product.variants[0];
  if (variant === undefined) {
    throw new Error("fixture product has no variant");
  }
  return { variantId: variant.id, sku };
}

export async function createShopper({
  priceCents = 2_490,
  stock = 10,
  quantity = 1,
  deliveryMethod = "STANDARD",
  variantId,
  emailPrefix = "proof",
} = {}) {
  const { variantId: seededVariant } =
    variantId === undefined
      ? await seedProduct({ priceCents, stock })
      : { variantId };

  const suffix = randomUUID().slice(0, 8);
  const email = `${emailPrefix}-${suffix}@example.test`;
  const user = await db.user.create({
    data: {
      email,
      passwordHash: await demoPasswordHash(),
      name: "Proof Shopper",
    },
    select: { id: true },
  });
  const address = await db.address.create({
    data: {
      userId: user.id,
      label: "Home",
      line1: "1 Proof Lane",
      city: "Portland",
      postalCode: "97205",
      country: "United States",
      isDefault: true,
    },
    select: { id: true },
  });
  const cart = await db.cart.create({
    data: {
      userId: user.id,
      deliveryMethod,
      items: { create: { variantId: seededVariant, quantity } },
    },
    select: { id: true },
  });
  const version = cartVersion([{ variantId: seededVariant, quantity }]);

  return {
    userId: user.id,
    email,
    password: PASSWORD,
    addressId: address.id,
    cartId: cart.id,
    variantId: seededVariant,
    quantity,
    priceCents,
    deliveryMethod,
    cartVersion: version,
    idempotencyKey: idempotencyKey(cart.id, version),
  };
}

export function psql(sql) {
  const url = new URL(process.env.DATABASE_URL);
  const args = [
    "-h",
    url.hostname,
    "-p",
    url.port || "5432",
    "-U",
    decodeURIComponent(url.username),
    "-d",
    url.pathname.replace(/^\//, ""),
    "-tA",
    "-F",
    "|",
    "-c",
    sql,
  ];
  const env = { ...process.env };
  if (url.password) {
    env.PGPASSWORD = decodeURIComponent(url.password);
  }
  const result = spawnSync("psql", args, { encoding: "utf8", env, windowsHide: true });
  if (result.status !== 0) {
    throw new Error(`psql failed: ${result.stderr.trim() || result.error?.message}`);
  }
  return result.stdout.trim();
}

function cookieValues(response) {
  const jar = new Map();
  for (const raw of response.headers.getSetCookie()) {
    const pair = raw.split(";")[0];
    const eq = pair.indexOf("=");
    if (eq > 0) {
      jar.set(pair.slice(0, eq).trim(), pair.slice(eq + 1).trim());
    }
  }
  return jar;
}

function cookieHeader(jar) {
  return [...jar.entries()].map(([name, value]) => `${name}=${value}`).join("; ");
}

// Auth.js credentials sign-in: fetch the CSRF token, then post it back with
// the cookie that minted it. Returns the Cookie header for authenticated calls.
export async function signIn(baseUrl, email, password = PASSWORD) {
  const csrfResponse = await fetch(`${baseUrl}/api/auth/csrf`);
  const jar = cookieValues(csrfResponse);
  const { csrfToken } = await csrfResponse.json();

  const body = new URLSearchParams({
    csrfToken,
    email,
    password,
    callbackUrl: `${baseUrl}/account`,
  });
  const response = await fetch(`${baseUrl}/api/auth/callback/credentials`, {
    method: "POST",
    headers: {
      "content-type": "application/x-www-form-urlencoded",
      cookie: cookieHeader(jar),
    },
    body,
    redirect: "manual",
  });

  for (const [name, value] of cookieValues(response)) {
    jar.set(name, value);
  }

  const session =
    jar.get("authjs.session-token") ?? jar.get("__Secure-authjs.session-token");
  if (session === undefined || session.length === 0) {
    throw new Error(
      `sign-in failed for ${email}: HTTP ${response.status}, cookies=[${[...jar.keys()].join(", ")}]`,
    );
  }

  return cookieHeader(jar);
}

export async function checkout(baseUrl, cookie, shopper, bodyExtras = {}) {
  const response = await fetch(`${baseUrl}/api/checkout`, {
    method: "POST",
    headers: { "content-type": "application/json", cookie },
    body: JSON.stringify({
      addressId: shopper.addressId,
      cartVersion: shopper.cartVersion,
      ...bodyExtras,
    }),
  });
  let json = null;
  try {
    json = await response.json();
  } catch {
    json = null;
  }
  return { status: response.status, body: json };
}

export async function closeFixtures() {
  await db.$disconnect();
}
