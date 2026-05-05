import { beforeEach, describe, expect, it, vi } from "vitest";

// `mergeAnonymousCartIntoUserCart` reads the cart cookie through
// `next/headers`. The store below behaves like the real cookie jar for the two
// operations the merge performs: read the anonymous id, then delete it.
const cookieJar = vi.hoisted(() => ({
  anonymousId: null as string | null,
  deleted: 0,
}));

// The merge itself never reads the session; a stub keeps next-auth's
// `next/server` import out of the Node test environment.
vi.mock("@/auth", () => ({
  auth: async () => null,
}));

vi.mock("next/headers", () => ({
  cookies: async () => ({
    get: (name: string) =>
      name === "kestrel_cart" && cookieJar.anonymousId !== null
        ? { name, value: cookieJar.anonymousId }
        : undefined,
    delete: (name: string) => {
      if (name === "kestrel_cart") {
        cookieJar.deleted += 1;
        cookieJar.anonymousId = null;
      }
    },
    set: (name: string, value: string) => {
      if (name === "kestrel_cart") {
        cookieJar.anonymousId = value;
      }
    },
  }),
}));

import { mergeAnonymousCartIntoUserCart } from "@/lib/cart";

import {
  createUser,
  createVariant,
  resetDatabase,
  testDb,
} from "./helpers";

beforeEach(async () => {
  await resetDatabase();
  cookieJar.anonymousId = null;
  cookieJar.deleted = 0;
});

describe("anonymous cart merge at sign-in", () => {
  it("merges once, keeps the higher quantity and deletes the anonymous cart", async () => {
    const userId = await createUser();
    const shared = await createVariant({ priceCents: 2_000, stock: 10 });
    const accountOnly = await createVariant({ priceCents: 3_000, stock: 10 });

    const anonymousId = `anon-${crypto.randomUUID()}`;
    await testDb.cart.create({
      data: {
        anonymousId,
        items: { create: [{ variantId: shared.variantId, quantity: 2 }] },
      },
    });
    await testDb.cart.create({
      data: {
        userId,
        items: {
          create: [
            { variantId: shared.variantId, quantity: 1 },
            { variantId: accountOnly.variantId, quantity: 1 },
          ],
        },
      },
    });

    cookieJar.anonymousId = anonymousId;
    await mergeAnonymousCartIntoUserCart(userId);

    const userCart = await testDb.cart.findUniqueOrThrow({
      where: { userId },
      include: { items: { orderBy: { variantId: "asc" } } },
    });
    const quantities = new Map(
      userCart.items.map((item) => [item.variantId, item.quantity]),
    );

    // Higher quantity wins: 2 from the anonymous cart beats 1 on the account.
    expect(quantities.get(shared.variantId)).toBe(2);
    expect(quantities.get(accountOnly.variantId)).toBe(1);
    expect(userCart.items).toHaveLength(2);

    // The source row and the cookie are both gone.
    expect(
      await testDb.cart.count({ where: { anonymousId } }),
    ).toBe(0);
    expect(cookieJar.deleted).toBe(1);

    // Replaying the merge (a stale cookie, a double sign-in) finds no source
    // cart and must not inflate quantities.
    cookieJar.anonymousId = anonymousId;
    await mergeAnonymousCartIntoUserCart(userId);

    const afterReplay = await testDb.cart.findUniqueOrThrow({
      where: { userId },
      include: { items: { orderBy: { variantId: "asc" } } },
    });
    expect(afterReplay.items).toHaveLength(2);
    expect(
      afterReplay.items.reduce((sum, item) => sum + item.quantity, 0),
    ).toBe(3);
    expect(await testDb.cartItem.count()).toBe(2);
  });

  it("keeps the account quantity when it is already the higher one", async () => {
    const userId = await createUser();
    const variant = await createVariant({ priceCents: 2_000, stock: 10 });
    const anonymousId = `anon-${crypto.randomUUID()}`;

    await testDb.cart.create({
      data: {
        anonymousId,
        items: { create: [{ variantId: variant.variantId, quantity: 1 }] },
      },
    });
    await testDb.cart.create({
      data: {
        userId,
        items: { create: [{ variantId: variant.variantId, quantity: 4 }] },
      },
    });

    cookieJar.anonymousId = anonymousId;
    await mergeAnonymousCartIntoUserCart(userId);

    const line = await testDb.cartItem.findFirstOrThrow({
      where: { cart: { userId }, variantId: variant.variantId },
      select: { quantity: true },
    });
    expect(line.quantity).toBe(4);
  });

  it("does nothing when the browser has no anonymous cart cookie", async () => {
    const userId = await createUser();

    await mergeAnonymousCartIntoUserCart(userId);

    expect(await testDb.cart.count()).toBe(0);
    expect(cookieJar.deleted).toBe(0);
  });
});
