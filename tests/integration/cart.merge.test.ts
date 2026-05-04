import { execSync } from "node:child_process";
import { randomUUID } from "node:crypto";

import { PrismaClient } from "@prisma/client";
import {
  afterAll,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";

// `next/headers` only exists inside a request. The cart module calls it through
// one small surface (get/set/delete), so an in-memory jar lets these tests
// exercise the real cookie-writing code — including the sign-in clear.
const cookieJar = vi.hoisted(() => ({
  values: new Map<string, string>(),
  options: [] as Array<Record<string, unknown>>,
}));

vi.mock("next/headers", () => ({
  cookies: async () => ({
    get(name: string) {
      if (!cookieJar.values.has(name)) {
        return undefined;
      }
      return { name, value: cookieJar.values.get(name) };
    },
    set(name: string, value: string, options?: Record<string, unknown>) {
      cookieJar.values.set(name, value);
      cookieJar.options.push(options ?? {});
    },
    delete(name: string) {
      cookieJar.values.delete(name);
    },
  }),
}));

import {
  CART_COOKIE_NAME,
  CART_TTL_DAYS,
  addCartLine,
  getCurrentCart,
  getOrCreateCartId,
  isUuid,
  mergeAnonymousCart,
  mergeCartOnSignIn,
  removeCartLine,
  setCartLineQuantity,
} from "@/lib/cart";
import { db } from "@/lib/db";

function run(command: string): void {
  try {
    execSync(command, {
      cwd: process.cwd(),
      env: process.env,
      stdio: "pipe",
      timeout: 110_000,
    });
  } catch (error: unknown) {
    const stderr =
      typeof error === "object" && error !== null && "stderr" in error
        ? String((error as { stderr?: unknown }).stderr ?? "")
        : "";
    throw new Error(`Command failed: ${command}\n${stderr}`);
  }
}

const fixture = {
  categoryId: randomUUID(),
  productId: randomUUID(),
  variantId: randomUUID(),
  limitedVariantId: randomUUID(),
  userA: randomUUID(),
  userB: randomUUID(),
  userC: randomUUID(),
};

const fixtureUserIds = [fixture.userA, fixture.userB, fixture.userC];
const suffix = randomUUID().slice(0, 8);

function futureDate(): Date {
  return new Date(Date.now() + CART_TTL_DAYS * 24 * 60 * 60 * 1_000);
}

async function createAnonymousCart(
  items: Array<{ variantId: string; quantity: number }>,
  expiresAt: Date = futureDate(),
): Promise<string> {
  const id = randomUUID();
  await db.cart.create({ data: { id, userId: null, expiresAt } });
  for (const item of items) {
    await db.cartItem.create({
      data: { cartId: id, variantId: item.variantId, quantity: item.quantity },
    });
  }
  return id;
}

async function createUserCart(
  userId: string,
  items: Array<{ variantId: string; quantity: number }>,
): Promise<string> {
  const id = randomUUID();
  await db.cart.create({ data: { id, userId, expiresAt: futureDate() } });
  for (const item of items) {
    await db.cartItem.create({
      data: { cartId: id, variantId: item.variantId, quantity: item.quantity },
    });
  }
  return id;
}

async function quantityIn(cartId: string, variantId: string): Promise<number | null> {
  const row = await db.cartItem.findUnique({
    where: { cartId_variantId: { cartId, variantId } },
    select: { quantity: true },
  });
  return row?.quantity ?? null;
}

beforeAll(() => {
  run("npx --no-install prisma migrate deploy");

  return (async () => {
    await db.category.create({
      data: {
        id: fixture.categoryId,
        slug: `cart-merge-${suffix}`,
        name: "Cart merge fixture",
      },
    });
    await db.product.create({
      data: {
        id: fixture.productId,
        slug: `cart-merge-product-${suffix}`,
        name: "Cart merge product",
        description: "Fixture product for cart merge tests.",
        categoryId: fixture.categoryId,
      },
    });
    await db.variant.createMany({
      data: [
        {
          id: fixture.variantId,
          productId: fixture.productId,
          sku: `CART-MERGE-${suffix}-A`,
          name: "Normal stock",
          priceCents: 1_500,
          stock: 6,
        },
        {
          id: fixture.limitedVariantId,
          productId: fixture.productId,
          sku: `CART-MERGE-${suffix}-B`,
          name: "Limited stock",
          priceCents: 700,
          stock: 3,
        },
      ],
    });
    await db.user.createMany({
      data: [
        { id: fixture.userA, email: `cart-a-${suffix}@example.test` },
        { id: fixture.userB, email: `cart-b-${suffix}@example.test` },
        { id: fixture.userC, email: `cart-c-${suffix}@example.test` },
      ],
    });
  })();
}, 120_000);

beforeEach(async () => {
  cookieJar.values.clear();
  cookieJar.options.length = 0;
  await db.cart.deleteMany({
    where: { OR: [{ userId: { in: fixtureUserIds } }, { userId: null }] },
  });
});

afterAll(async () => {
  await db.cart.deleteMany({
    where: { OR: [{ userId: { in: fixtureUserIds } }, { userId: null }] },
  });
  await db.user.deleteMany({ where: { id: { in: fixtureUserIds } } });
  await db.variant.deleteMany({
    where: { id: { in: [fixture.variantId, fixture.limitedVariantId] } },
  });
  await db.product.delete({ where: { id: fixture.productId } });
  await db.category.delete({ where: { id: fixture.categoryId } });
  await db.$disconnect();
});

describe("anonymous cart persistence", () => {
  it("writes cart_id with the required cookie attributes", async () => {
    const cartId = await getOrCreateCartId();

    expect(isUuid(cartId)).toBe(true);
    expect(cookieJar.values.get(CART_COOKIE_NAME)).toBe(cartId);
    expect(cookieJar.options.at(-1)).toMatchObject({
      httpOnly: true,
      secure: true,
      sameSite: "lax",
      path: "/",
      maxAge: CART_TTL_DAYS * 24 * 60 * 60,
    });
  });

  it("persists add/update/remove across a new Prisma client", async () => {
    const cartId = await getOrCreateCartId();
    await addCartLine(cartId, fixture.variantId, 2);
    await addCartLine(cartId, fixture.variantId, 2);

    const cart = await getCurrentCart();
    expect(cart.id).toBe(cartId);
    expect(cart.items).toHaveLength(1);
    expect(cart.items[0]?.quantity).toBe(4);
    expect(cart.totals.subtotalCents).toBe(6_000);

    // A new client is the closest stand-in for a server restart: no process
    // cache, no ORM identity map, just the rows Postgres committed.
    const fresh = new PrismaClient();
    try {
      const persisted = await fresh.cartItem.findUnique({
        where: {
          cartId_variantId: { cartId, variantId: fixture.variantId },
        },
        select: { quantity: true },
      });
      expect(persisted?.quantity).toBe(4);
    } finally {
      await fresh.$disconnect();
    }

    await setCartLineQuantity(cartId, fixture.variantId, 9);
    expect(await quantityIn(cartId, fixture.variantId)).toBe(6);

    await setCartLineQuantity(cartId, fixture.variantId, 0);
    expect(await quantityIn(cartId, fixture.variantId)).toBeNull();
    expect((await getCurrentCart()).items).toHaveLength(0);
  });

  it("clamps additions and updates to Variant.stock", async () => {
    const cartId = await getOrCreateCartId();
    await addCartLine(cartId, fixture.limitedVariantId, 10);
    expect(await quantityIn(cartId, fixture.limitedVariantId)).toBe(3);

    await setCartLineQuantity(cartId, fixture.limitedVariantId, 99);
    expect(await quantityIn(cartId, fixture.limitedVariantId)).toBe(3);

    await removeCartLine(cartId, fixture.limitedVariantId);
    expect(await quantityIn(cartId, fixture.limitedVariantId)).toBeNull();
  });

  it("rejects invalid quantities instead of pricing them", async () => {
    const cartId = await getOrCreateCartId();
    await expect(addCartLine(cartId, fixture.variantId, 0)).rejects.toThrow(
      RangeError,
    );
    await expect(
      setCartLineQuantity(cartId, fixture.variantId, -1),
    ).rejects.toThrow(RangeError);
  });
});

describe("sign-in merge", () => {
  it("merges an anonymous cart into the user's cart exactly once, clamped to stock", async () => {
    const sourceId = await createAnonymousCart([
      { variantId: fixture.variantId, quantity: 9 },
      { variantId: fixture.limitedVariantId, quantity: 10 },
    ]);
    const targetId = await createUserCart(fixture.userA, [
      { variantId: fixture.variantId, quantity: 2 },
    ]);

    const first = await mergeAnonymousCart(fixture.userA, sourceId);
    expect(first.merged).toBe(true);
    expect(first.targetCartId).toBe(targetId);
    expect(await quantityIn(targetId, fixture.variantId)).toBe(6);
    expect(await quantityIn(targetId, fixture.limitedVariantId)).toBe(3);
    expect(await db.cart.findUnique({ where: { id: sourceId } })).toBeNull();

    const before = await quantityIn(targetId, fixture.variantId);
    const second = await mergeAnonymousCart(fixture.userA, sourceId);
    expect(second).toMatchObject({ merged: false, reason: "missing" });
    expect(await quantityIn(targetId, fixture.variantId)).toBe(before);
  });

  it("creates the user's cart when none exists", async () => {
    const sourceId = await createAnonymousCart([
      { variantId: fixture.variantId, quantity: 2 },
    ]);

    const result = await mergeAnonymousCart(fixture.userB, sourceId);
    expect(result.merged).toBe(true);
    expect(result.targetCartId).not.toBeNull();
    if (result.targetCartId === null) {
      throw new Error("expected a target cart");
    }

    const target = await db.cart.findUnique({
      where: { id: result.targetCartId },
      select: { userId: true },
    });
    expect(target?.userId).toBe(fixture.userB);
    expect(await getOrCreateCartId(fixture.userB)).toBe(result.targetCartId);
  });

  it("clears the cookie and replays as a no-op", async () => {
    const sourceId = await createAnonymousCart([
      { variantId: fixture.variantId, quantity: 3 },
    ]);
    cookieJar.values.set(CART_COOKIE_NAME, sourceId);

    const first = await mergeCartOnSignIn(fixture.userC);
    expect(first?.merged).toBe(true);
    expect(cookieJar.values.has(CART_COOKIE_NAME)).toBe(false);

    const targetId = first?.targetCartId;
    if (targetId === null || targetId === undefined) {
      throw new Error("expected a target cart");
    }
    const mergedQuantity = await quantityIn(targetId, fixture.variantId);
    expect(mergedQuantity).toBe(3);

    // A stale cookie pointing at the deleted source is a replay: no guard flag,
    // just the missing row.
    cookieJar.values.set(CART_COOKIE_NAME, sourceId);
    const replay = await mergeCartOnSignIn(fixture.userC);
    expect(replay).toMatchObject({ merged: false, reason: "missing" });
    expect(cookieJar.values.has(CART_COOKIE_NAME)).toBe(false);
    expect(await quantityIn(targetId, fixture.variantId)).toBe(mergedQuantity);
  });

  it("treats the user's own cart as already merged", async () => {
    const ownCartId = await createUserCart(fixture.userA, [
      { variantId: fixture.variantId, quantity: 1 },
    ]);

    const result = await mergeAnonymousCart(fixture.userA, ownCartId);
    expect(result).toMatchObject({ merged: false, reason: "already-merged" });
    expect(await quantityIn(ownCartId, fixture.variantId)).toBe(1);
  });

  it("never merges a cart owned by another account", async () => {
    const foreignId = await createUserCart(fixture.userB, [
      { variantId: fixture.variantId, quantity: 4 },
    ]);
    cookieJar.values.set(CART_COOKIE_NAME, foreignId);

    const result = await mergeCartOnSignIn(fixture.userC);
    expect(result).toMatchObject({ merged: false, reason: "foreign" });
    expect(cookieJar.values.has(CART_COOKIE_NAME)).toBe(false);
    expect(await quantityIn(foreignId, fixture.variantId)).toBe(4);
  });

  it("drops an expired anonymous cart without merging it", async () => {
    const expiredId = await createAnonymousCart(
      [{ variantId: fixture.variantId, quantity: 2 }],
      new Date(Date.now() - 1_000),
    );

    const result = await mergeAnonymousCart(fixture.userC, expiredId);
    expect(result).toMatchObject({ merged: false, reason: "expired" });
    expect(await db.cart.findUnique({ where: { id: expiredId } })).toBeNull();
  });
});
