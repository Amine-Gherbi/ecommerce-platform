"use server";

import { revalidatePath } from "next/cache";

import { db } from "@/lib/db";
import { requireUserId } from "@/lib/session";

// Delivery is a server-side choice: it lives on the cart and is snapshotted
// onto the order. The checkout POST still carries only `{addressId,
// cartVersion}`, so the client cannot talk the server into free shipping.
export async function chooseDeliveryMethod(formData: FormData): Promise<void> {
  const userId = await requireUserId("/checkout");
  const value = String(formData.get("deliveryMethod") ?? "");

  if (value !== "STANDARD" && value !== "EXPRESS") {
    return;
  }

  const cart = await db.cart.findUnique({
    where: { userId },
    select: { id: true },
  });
  if (cart === null) {
    return;
  }

  await db.cart.update({
    where: { id: cart.id },
    data: { deliveryMethod: value },
  });

  revalidatePath("/checkout");
}
