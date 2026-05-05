import { randomUUID } from "node:crypto";

import { beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({
  cartId: null as string | null,
  revalidated: [] as string[],
}));

vi.mock("next/cache", () => ({
  revalidatePath: (path: string) => {
    state.revalidated.push(path);
  },
}));

// Cart identity is covered by cart.page.test.ts; these tests isolate the
// action's own decisions (validation, stock cap, ownership).
vi.mock("@/lib/cart", () => ({
  getOrCreateCart: async () => ({ cartId: state.cartId, anonymousId: "anon" }),
  getCurrentCartId: async () => state.cartId,
}));

import {
  addItemToCart,
  removeCartItem,
  setCartItemQuantity,
} from "@/app/cart/actions";

import {
  createVariant,
  resetDatabase,
  testDb,
} from "./helpers";

beforeEach(async () => {
  await resetDatabase();
  state.cartId = null;
  state.revalidated = [];
});

async function makeCart(): Promise<string> {
  const cart = await testDb.cart.create({
    data: { anonymousId: `anon-${randomUUID()}` },
    select: { id: true },
  });
  state.cartId = cart.id;
  return cart.id;
}

describe("addItemToCart", () => {
  it("rejects a malformed variant id before touching the database", async () => {
    await expect(addItemToCart("not-a-uuid", 1)).resolves.toEqual({
      ok: false,
      message: "This item is not available.",
    });
  });

  it("rejects quantities that are not positive whole units", async () => {
    const variant = await createVariant({ priceCents: 1_000, stock: 5 });
    await makeCart();

    for (const quantity of [0, -2, Number.NaN]) {
      await expect(addItemToCart(variant.variantId, quantity)).resolves.toEqual(
        { ok: false, message: "Choose a quantity." },
      );
    }
  });

  it("refuses an unknown, archived or sold-out variant", async () => {
    await makeCart();
    const soldOut = await createVariant({ priceCents: 1_000, stock: 0 });

    await expect(
      addItemToCart(randomUUID(), 1),
    ).resolves.toEqual({ ok: false, message: "This item is sold out." });
    await expect(
      addItemToCart(soldOut.variantId, 1),
    ).resolves.toEqual({ ok: false, message: "This item is sold out." });

    const archived = await testDb.product.findFirstOrThrow({
      where: { variants: { some: { id: soldOut.variantId } } },
      select: { id: true },
    });
    await testDb.variant.update({
      where: { id: soldOut.variantId },
      data: { stock: 4 },
    });
    await testDb.product.update({
      where: { id: archived.id },
      data: { status: "ARCHIVED" },
    });
    await expect(
      addItemToCart(soldOut.variantId, 1),
    ).resolves.toEqual({ ok: false, message: "This item is sold out." });
  });

  it("adds stock-bounded quantities and caps at the cart maximum", async () => {
    const cartId = await makeCart();
    const scarce = await createVariant({ priceCents: 1_000, stock: 5 });
    const plentiful = await createVariant({ priceCents: 1_000, stock: 50 });

    await expect(addItemToCart(scarce.variantId, 2)).resolves.toEqual({
      ok: true,
    });
    await expect(addItemToCart(scarce.variantId, 2)).resolves.toEqual({
      ok: true,
    });
    await expect(addItemToCart(scarce.variantId, 10)).resolves.toEqual({
      ok: true,
    });

    const scarceLine = await testDb.cartItem.findUniqueOrThrow({
      where: {
        cartId_variantId: { cartId, variantId: scarce.variantId },
      },
      select: { quantity: true },
    });
    expect(scarceLine.quantity).toBe(5);

    await expect(addItemToCart(plentiful.variantId, 8)).resolves.toEqual({
      ok: true,
    });
    await expect(addItemToCart(plentiful.variantId, 8)).resolves.toEqual({
      ok: true,
    });
    const plentifulLine = await testDb.cartItem.findUniqueOrThrow({
      where: {
        cartId_variantId: { cartId, variantId: plentiful.variantId },
      },
      select: { quantity: true },
    });
    expect(plentifulLine.quantity).toBe(10);
    expect(state.revalidated).toContain("/cart");
  });
});

describe("setCartItemQuantity", () => {
  it("rejects malformed identifiers and quantities", async () => {
    await expect(setCartItemQuantity("nope", 1)).resolves.toEqual({
      ok: false,
      message: "This cart line no longer exists.",
    });

    await makeCart();
    await expect(
      setCartItemQuantity(randomUUID(), Number.NaN),
    ).resolves.toEqual({ ok: false, message: "Choose a quantity." });
  });

  it("refuses when the visitor has no cart or the line is not theirs", async () => {
    await expect(
      setCartItemQuantity(randomUUID(), 1),
    ).resolves.toEqual({ ok: false, message: "Your cart is empty." });

    await makeCart();
    await expect(
      setCartItemQuantity(randomUUID(), 1),
    ).resolves.toEqual({
      ok: false,
      message: "This cart line no longer exists.",
    });
  });

  it("removes a line at quantity zero", async () => {
    const cartId = await makeCart();
    const variant = await createVariant({ priceCents: 1_000, stock: 5 });
    const item = await testDb.cartItem.create({
      data: { cartId, variantId: variant.variantId, quantity: 2 },
      select: { id: true },
    });

    await expect(setCartItemQuantity(item.id, 0)).resolves.toEqual({
      ok: true,
    });
    expect(await testDb.cartItem.count({ where: { id: item.id } })).toBe(0);
    expect(state.revalidated).toContain("/cart");
  });

  it("refuses to sell a sold-out variant and caps at available stock", async () => {
    const cartId = await makeCart();
    const soldOut = await createVariant({ priceCents: 1_000, stock: 1 });
    const scarce = await createVariant({ priceCents: 1_000, stock: 3 });

    const soldOutItem = await testDb.cartItem.create({
      data: { cartId, variantId: soldOut.variantId, quantity: 1 },
      select: { id: true },
    });
    const scarceItem = await testDb.cartItem.create({
      data: { cartId, variantId: scarce.variantId, quantity: 1 },
      select: { id: true },
    });
    await testDb.variant.update({
      where: { id: soldOut.variantId },
      data: { stock: 0 },
    });

    await expect(setCartItemQuantity(soldOutItem.id, 2)).resolves.toEqual({
      ok: false,
      message: "This item is sold out.",
    });
    await expect(setCartItemQuantity(scarceItem.id, 9)).resolves.toEqual({
      ok: true,
    });

    const line = await testDb.cartItem.findUniqueOrThrow({
      where: { id: scarceItem.id },
      select: { quantity: true },
    });
    expect(line.quantity).toBe(3);
  });
});

describe("removeCartItem", () => {
  it("rejects malformed ids", async () => {
    await expect(removeCartItem("not-a-uuid")).resolves.toEqual({
      ok: false,
      message: "This cart line no longer exists.",
    });
  });

  it("refuses when there is no cart", async () => {
    await expect(removeCartItem(randomUUID())).resolves.toEqual({
      ok: false,
      message: "Your cart is empty.",
    });
  });

  it("removes only a line belonging to the visitor's cart", async () => {
    const cartId = await makeCart();
    const variant = await createVariant({ priceCents: 1_000, stock: 5 });
    const item = await testDb.cartItem.create({
      data: { cartId, variantId: variant.variantId, quantity: 1 },
      select: { id: true },
    });

    const otherCart = await testDb.cart.create({
      data: { anonymousId: `anon-${randomUUID()}` },
      select: { id: true },
    });
    const otherItem = await testDb.cartItem.create({
      data: {
        cartId: otherCart.id,
        variantId: variant.variantId,
        quantity: 1,
      },
      select: { id: true },
    });

    await expect(removeCartItem(item.id)).resolves.toEqual({ ok: true });
    expect(await testDb.cartItem.count({ where: { id: item.id } })).toBe(0);
    expect(await testDb.cartItem.count({ where: { id: otherItem.id } })).toBe(1);
    expect(state.revalidated).toContain("/cart");
  });
});
