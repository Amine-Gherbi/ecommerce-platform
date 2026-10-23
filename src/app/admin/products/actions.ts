"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { auth } from "@/auth";
import { setProductArchived } from "@/lib/admin";

// The single admin mutation in the app: archive or restore a product.
//
// Server Actions get Next's built-in Origin/Host check, but that says nothing
// about authorization — the session role is checked here, on every call.
// Archiving never deletes a Product, Variant, Order or OrderItem.

export async function setProductArchivedAction(
  formData: FormData,
): Promise<void> {
  const session = await auth();
  if (session?.user?.role !== "ADMIN") {
    redirect("/login");
  }

  const productId = formData.get("productId");
  const archive = formData.get("archive");
  if (typeof productId !== "string" || productId.length === 0) {
    throw new RangeError("productId is required");
  }
  if (archive !== "true" && archive !== "false") {
    throw new RangeError("archive must be true or false");
  }

  await setProductArchived(productId, archive === "true");
  revalidatePath("/admin/products");
  revalidatePath("/");
}
