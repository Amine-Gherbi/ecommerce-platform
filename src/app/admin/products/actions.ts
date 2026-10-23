"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { requireAdmin } from "@/lib/admin";
import {
  parseSpecRows,
  saveProductDetails,
  saveProductImages,
  saveProductSpecs,
  saveProductVariants,
  setProductArchived,
} from "@/lib/admin-products";
import { isUuid } from "@/lib/ids";

function detailPath(productId: string): string {
  return `/admin/products/${productId}`;
}

function fail(productId: string, message: string): never {
  redirect(`${detailPath(productId)}?error=${encodeURIComponent(message)}`);
}

function revalidateProduct(productId: string): void {
  revalidatePath("/admin");
  revalidatePath("/admin/products");
  revalidatePath(detailPath(productId));
  // Storefront product and category pages read the same rows.
  revalidatePath("/p/[slug]", "page");
  revalidatePath("/c/[slug]", "page");
  revalidatePath("/search");
  revalidatePath("/");
}

export async function saveProductDetailsAction(
  formData: FormData,
): Promise<void> {
  const actorId = await requireAdmin("/admin/products");
  const productId = String(formData.get("productId") ?? "");

  if (!isUuid(productId)) {
    redirect("/admin/products?error=Product+not+found.");
  }

  const result = await saveProductDetails({
    productId,
    title: String(formData.get("title") ?? ""),
    description: String(formData.get("description") ?? ""),
    actorId,
  });

  if (!result.ok) {
    fail(productId, result.message);
  }

  revalidateProduct(productId);
  redirect(`${detailPath(productId)}?saved=details`);
}

export async function saveProductSpecsAction(
  formData: FormData,
): Promise<void> {
  const actorId = await requireAdmin("/admin/products");
  const productId = String(formData.get("productId") ?? "");

  if (!isUuid(productId)) {
    redirect("/admin/products?error=Product+not+found.");
  }

  const parsed = parseSpecRows(
    formData.getAll("specKey").map(String),
    formData.getAll("specValue").map(String),
  );
  if (!parsed.ok) {
    fail(productId, parsed.message);
  }

  const result = await saveProductSpecs({
    productId,
    specs: parsed.specs,
    actorId,
  });

  if (!result.ok) {
    fail(productId, result.message);
  }

  revalidateProduct(productId);
  redirect(`${detailPath(productId)}?saved=specs`);
}

export async function saveProductVariantsAction(
  formData: FormData,
): Promise<void> {
  const actorId = await requireAdmin("/admin/products");
  const productId = String(formData.get("productId") ?? "");

  if (!isUuid(productId)) {
    redirect("/admin/products?error=Product+not+found.");
  }

  const result = await saveProductVariants({ productId, formData, actorId });

  if (!result.ok) {
    fail(productId, result.message);
  }

  revalidateProduct(productId);
  redirect(`${detailPath(productId)}?saved=variants`);
}

export async function saveProductImagesAction(
  formData: FormData,
): Promise<void> {
  const actorId = await requireAdmin("/admin/products");
  const productId = String(formData.get("productId") ?? "");

  if (!isUuid(productId)) {
    redirect("/admin/products?error=Product+not+found.");
  }

  const result = await saveProductImages({ productId, formData, actorId });

  if (!result.ok) {
    fail(productId, result.message);
  }

  revalidateProduct(productId);
  redirect(`${detailPath(productId)}?saved=images`);
}

export async function setProductArchivedAction(
  formData: FormData,
): Promise<void> {
  const actorId = await requireAdmin("/admin/products");
  const productId = String(formData.get("productId") ?? "");
  const archived = String(formData.get("archived") ?? "") === "true";

  if (!isUuid(productId)) {
    redirect("/admin/products?error=Product+not+found.");
  }

  const result = await setProductArchived({ productId, archived, actorId });

  if (!result.ok) {
    redirect(`/admin/products?error=${encodeURIComponent(result.message)}`);
  }

  revalidateProduct(productId);
  redirect(`/admin/products?saved=${archived ? "archived" : "restored"}`);
}
