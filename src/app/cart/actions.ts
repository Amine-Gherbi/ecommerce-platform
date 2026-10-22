"use server";

import { revalidatePath } from "next/cache";

import { auth } from "@/auth";
import {
  addCartLine,
  getOrCreateCartId,
  removeCartLine,
  setCartLineQuantity,
} from "@/lib/cart";

// Every mutation is a Server Action, so Next's built-in Origin/Host check
// applies before the function body runs. The functions below never trust a
// price from the form: they take a variant id and a quantity only, and all
// money is recomputed from `Variant.priceCents`.

function readVariantId(formData: FormData): string {
  const value = formData.get("variantId");
  if (typeof value !== "string" || value.length === 0) {
    throw new RangeError("variantId is required");
  }
  return value;
}

function readQuantity(formData: FormData): number {
  const value = formData.get("quantity");
  const quantity = typeof value === "string" ? Number(value) : 1;
  if (!Number.isSafeInteger(quantity)) {
    throw new RangeError("quantity must be an integer");
  }
  return quantity;
}

async function currentUserId(): Promise<string | null> {
  const session = await auth();
  return session?.user?.id ?? null;
}

export async function addToCartAction(formData: FormData): Promise<void> {
  const variantId = readVariantId(formData);
  const quantity = Math.max(1, readQuantity(formData));
  const cartId = await getOrCreateCartId(await currentUserId());
  await addCartLine(cartId, variantId, quantity);
  revalidatePath("/cart");
}

export async function updateCartItemAction(formData: FormData): Promise<void> {
  const variantId = readVariantId(formData);
  const quantity = Math.max(0, readQuantity(formData));
  const cartId = await getOrCreateCartId(await currentUserId());
  await setCartLineQuantity(cartId, variantId, quantity);
  revalidatePath("/cart");
}

export async function removeCartItemAction(formData: FormData): Promise<void> {
  const variantId = readVariantId(formData);
  const cartId = await getOrCreateCartId(await currentUserId());
  await removeCartLine(cartId, variantId);
  revalidatePath("/cart");
}
