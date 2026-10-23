import { beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({
  sessionUserId: null as string | null,
  cookie: null as string | null,
}));

vi.mock("@/auth", () => ({
  auth: async () =>
    state.sessionUserId === null
      ? null
      : { user: { id: state.sessionUserId, role: "CUSTOMER" } },
}));

vi.mock("next/headers", () => ({
  cookies: async () => ({
    get: (name: string) =>
      name === "kestrel_cart" && state.cookie !== null
        ? { name, value: state.cookie }
        : undefined,
    set: (name: string, value: string) => {
      if (name === "kestrel_cart") {
        state.cookie = value;
      }
    },
    delete: (name: string) => {
      if (name === "kestrel_cart") {
        state.cookie = null;
      }
    },
  }),
}));

import {
  getCartCount,
  getCartData,
  getCurrentCartId,
  getOrCreateCart,
} from "@/lib/cart";

import {
  createUser,
  createVariant,
  resetDatabase,
  testDb,
} from "./helpers";

beforeEach(async () => {
  await resetDatabase();
  state.sessionUserId = null;
  state.cookie = null;
});

describe("empty carts", () => {
  it("renders a zeroed summary when there is no cart", async () => {
    await expect(getCartData()).resolves.toEqual({
      items: [],
      itemCount: 0,
      subtotal: "€0.00",
      shipping: "€0.00",
      total: "€0.00",
      shippingRule:
        "Free standard shipping at or above €80.00; otherwise €4.90. Express €9.50.",
      freeShippingThreshold: "€80.00",
    });

    await expect(getCartCount()).resolves.toBe(0);
    await expect(getCurrentCartId()).resolves.toBeNull();
  });

  it("creates one anonymous cart and reuses it through the cookie", async () => {
    const first = await getOrCreateCart();
    expect(first.anonymousId).not.toBeNull();
    expect(state.cookie).toBe(first.anonymousId);

    const second = await getOrCreateCart();
    expect(second.cartId).toBe(first.cartId);
    expect(second.anonymousId).toBe(first.anonymousId);
    expect(await testDb.cart.count()).toBe(1);
  });
});

describe("anonymous cart rendering", () => {
  it("returns lines and server totals, including express shipping", async () => {
    const variant = await createVariant({ priceCents: 2_500, stock: 4 });
    const variantRow = await testDb.variant.findUniqueOrThrow({
      where: { id: variant.variantId },
      select: { productId: true, sku: true, title: true },
    });
    await testDb.productImage.create({
      data: {
        productId: variantRow.productId,
        url: "https://example.test/line.jpg",
        alt: "line",
        position: 0,
      },
    });

    const anonymousId = `anon-${crypto.randomUUID()}`;
    const cartRow = await testDb.cart.create({
      data: {
        anonymousId,
        deliveryMethod: "EXPRESS",
        items: { create: [{ variantId: variant.variantId, quantity: 2 }] },
      },
      select: { id: true },
    });
    state.cookie = anonymousId;

    const cart = await getCartData();
    expect(cart.itemCount).toBe(2);
    expect(cart.subtotal).toBe("€50.00");
    expect(cart.shipping).toBe("€9.50");
    expect(cart.total).toBe("€59.50");
    expect(cart.items).toEqual([
      {
        id: expect.any(String),
        variantId: variant.variantId,
        productSlug: expect.stringContaining("test-product-"),
        productTitle: "Test Product",
        brandName: "Test Brand",
        variantTitle: variantRow.title,
        quantity: 2,
        unitPrice: "€25.00",
        lineTotal: "€50.00",
        image: { url: "https://example.test/line.jpg", alt: "line" },
        inStock: true,
        maxQuantity: 4,
      },
    ]);

    await expect(getCartCount()).resolves.toBe(2);
    await expect(getCurrentCartId()).resolves.toBe(cartRow.id);
  });

  it("makes standard shipping free at the threshold", async () => {
    const variant = await createVariant({ priceCents: 4_000, stock: 10 });
    const anonymousId = `anon-${crypto.randomUUID()}`;
    await testDb.cart.create({
      data: {
        anonymousId,
        items: { create: [{ variantId: variant.variantId, quantity: 2 }] },
      },
    });
    state.cookie = anonymousId;

    const cart = await getCartData();
    expect(cart.subtotal).toBe("€80.00");
    expect(cart.shipping).toBe("Free");
    expect(cart.total).toBe("€80.00");
  });

  it("reports a sold-out line and caps quantity at the stock", async () => {
    const variant = await createVariant({ priceCents: 1_000, stock: 0 });
    const anonymousId = `anon-${crypto.randomUUID()}`;
    await testDb.cart.create({
      data: {
        anonymousId,
        items: { create: [{ variantId: variant.variantId, quantity: 3 }] },
      },
    });
    state.cookie = anonymousId;

    const cart = await getCartData();
    expect(cart.items[0]?.inStock).toBe(false);
    expect(cart.items[0]?.maxQuantity).toBe(0);
    expect(cart.items[0]?.image).toBeNull();
  });

  it("does not invent a cart for an unknown cookie", async () => {
    state.cookie = `anon-${crypto.randomUUID()}`;

    await expect(getCartCount()).resolves.toBe(0);
    await expect(getCurrentCartId()).resolves.toBeNull();
    await expect(getCartData()).resolves.toMatchObject({ itemCount: 0 });
  });
});

describe("signed-in cart rendering", () => {
  it("reads the user's cart rather than any cookie", async () => {
    const userId = await createUser();
    const variant = await createVariant({ priceCents: 3_000, stock: 8 });
    const cart = await testDb.cart.create({
      data: {
        userId,
        items: { create: [{ variantId: variant.variantId, quantity: 1 }] },
      },
      select: { id: true },
    });
    state.sessionUserId = userId;
    state.cookie = "a-stale-anonymous-cookie";

    await expect(getCurrentCartId()).resolves.toBe(cart.id);
    await expect(getCartCount()).resolves.toBe(1);
    await expect(getCartData()).resolves.toMatchObject({
      itemCount: 1,
      subtotal: "€30.00",
      shipping: "€4.90",
      total: "€34.90",
    });

    const created = await getOrCreateCart();
    expect(created).toEqual({ cartId: cart.id, anonymousId: null });
  });

  it("creates the signed-in cart on first add", async () => {
    const userId = await createUser();
    state.sessionUserId = userId;

    const created = await getOrCreateCart();
    expect(created.anonymousId).toBeNull();
    expect(
      await testDb.cart.count({ where: { userId } }),
    ).toBe(1);
    await expect(getCartCount()).resolves.toBe(0);
  });
});
