"use server";

import { revalidatePath } from "next/cache";

import { getCurrentCartId, getOrCreateCart } from "@/lib/cart";
import { db } from "@/lib/db";
import { MAX_CART_QUANTITY } from "@/lib/money";

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function isUuid(value: string): boolean {
  return UUID_PATTERN.test(value);
}

function normaliseQuantity(value: number): number | null {
  const quantity = Math.trunc(Number(value));
  return Number.isInteger(quantity) && quantity >= 0 ? quantity : null;
}

export async function addItemToCart(
  variantId: string,
  quantity: number,
): Promise<{ ok: true } | { ok: false; message: string }> {
  if (typeof variantId !== "string" || !isUuid(variantId)) {
    return { ok: false, message: "This item is not available." };
  }

  const requested = normaliseQuantity(quantity);
  if (requested === null || requested < 1) {
    return { ok: false, message: "Choose a quantity." };
  }

  try {
    const variant = await db.variant.findFirst({
      where: {
        id: variantId,
        product: { status: "ACTIVE" },
      },
      select: { id: true, stock: true },
    });

    if (variant === null || variant.stock <= 0) {
      return { ok: false, message: "This item is sold out." };
    }

    const { cartId } = await getOrCreateCart();
    const existing = await db.cartItem.findUnique({
      where: {
        cartId_variantId: { cartId, variantId: variant.id },
      },
      select: { quantity: true },
    });

    const nextQuantity = Math.min(
      (existing?.quantity ?? 0) + requested,
      variant.stock,
      MAX_CART_QUANTITY,
    );

    if (nextQuantity < 1) {
      return { ok: false, message: "This item is sold out." };
    }

    await db.cartItem.upsert({
      where: {
        cartId_variantId: { cartId, variantId: variant.id },
      },
      create: {
        cartId,
        variantId: variant.id,
        quantity: nextQuantity,
      },
      update: { quantity: nextQuantity },
    });

    revalidatePath("/cart");
    return { ok: true };
  } catch (error: unknown) {
    console.error("addItemToCart failed", error);
    return { ok: false, message: "Could not add this item. Try again." };
  }
}

export async function setCartItemQuantity(
  itemId: string,
  quantity: number,
): Promise<{ ok: true } | { ok: false; message: string }> {
  if (typeof itemId !== "string" || !isUuid(itemId)) {
    return { ok: false, message: "This cart line no longer exists." };
  }

  const requested = normaliseQuantity(quantity);
  if (requested === null) {
    return { ok: false, message: "Choose a quantity." };
  }

  try {
    const cartId = await getCurrentCartId();
    if (cartId === null) {
      return { ok: false, message: "Your cart is empty." };
    }

    const item = await db.cartItem.findFirst({
      where: { id: itemId, cartId },
      select: {
        id: true,
        variant: { select: { stock: true } },
      },
    });

    if (item === null) {
      return { ok: false, message: "This cart line no longer exists." };
    }

    if (requested === 0) {
      await db.cartItem.delete({ where: { id: item.id } });
      revalidatePath("/cart");
      return { ok: true };
    }

    if (item.variant.stock <= 0) {
      return { ok: false, message: "This item is sold out." };
    }

    await db.cartItem.update({
      where: { id: item.id },
      data: {
        quantity: Math.min(requested, item.variant.stock, MAX_CART_QUANTITY),
      },
    });

    revalidatePath("/cart");
    return { ok: true };
  } catch (error: unknown) {
    console.error("setCartItemQuantity failed", error);
    return { ok: false, message: "Could not update the quantity." };
  }
}

export async function removeCartItem(
  itemId: string,
): Promise<{ ok: true } | { ok: false; message: string }> {
  if (typeof itemId !== "string" || !isUuid(itemId)) {
    return { ok: false, message: "This cart line no longer exists." };
  }

  try {
    const cartId = await getCurrentCartId();
    if (cartId === null) {
      return { ok: false, message: "Your cart is empty." };
    }

    await db.cartItem.deleteMany({
      where: { id: itemId, cartId },
    });

    revalidatePath("/cart");
    return { ok: true };
  } catch (error: unknown) {
    console.error("removeCartItem failed", error);
    return { ok: false, message: "Could not remove this item." };
  }
}
