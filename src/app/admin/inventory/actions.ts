"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { requireAdmin } from "@/lib/admin";
import {
  parseIntegerField,
  saveVariantStock,
} from "@/lib/admin-products";

export async function updateStockAction(formData: FormData): Promise<void> {
  const actorId = await requireAdmin("/admin/inventory");

  const variantId = String(formData.get("variantId") ?? "");
  const stock = parseIntegerField(String(formData.get("stock") ?? ""));

  if (stock === null) {
    redirect(
      `/admin/inventory?error=${encodeURIComponent(
        "Stock must be a whole number of units.",
      )}`,
    );
  }

  const result = await saveVariantStock({ variantId, stock, actorId });

  if (!result.ok) {
    redirect(`/admin/inventory?error=${encodeURIComponent(result.message)}`);
  }

  revalidatePath("/admin/inventory");
  revalidatePath("/admin");
  redirect("/admin/inventory?saved=stock");
}
