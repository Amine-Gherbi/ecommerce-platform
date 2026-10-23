import type { Prisma, ProductStatus } from "@prisma/client";

import { recordAudit } from "@/lib/audit";
import { db } from "@/lib/db";
import { isUuid } from "@/lib/ids";

export type AdminMutationResult =
  | { ok: true; changed?: boolean }
  | { ok: false; message: string };

export interface SpecRow {
  key: string;
  value: string;
}

const MAX_SPECS = 40;
const MAX_SPEC_KEY = 80;
const MAX_SPEC_VALUE = 300;
const MAX_TITLE = 200;
const MAX_DESCRIPTION = 5_000;
const MAX_PRICE_CENTS = 100_000_000;
const MAX_STOCK = 1_000_000;

function failure(message: string): { ok: false; message: string } {
  return { ok: false, message };
}

export function parseIntegerField(value: string): number | null {
  const trimmed = value.trim();
  if (!/^\d+$/.test(trimmed)) {
    return null;
  }
  const parsed = Number(trimmed);
  return Number.isSafeInteger(parsed) ? parsed : null;
}

export function specRowsFromJson(specs: Prisma.JsonValue): SpecRow[] {
  if (specs === null || typeof specs !== "object" || Array.isArray(specs)) {
    return [];
  }

  return Object.entries(specs)
    .filter((entry): entry is [string, string] => typeof entry[1] === "string")
    .map(([key, value]) => ({ key, value }));
}

export type ParsedSpecs =
  | { ok: true; specs: Record<string, string> }
  | { ok: false; message: string };

// Empty rows disappear. A blank value removes that specification; a blank key
// with a value is an error rather than a silently discarded edit.
export function parseSpecRows(
  keys: readonly string[],
  values: readonly string[],
): ParsedSpecs {
  if (keys.length !== values.length) {
    return failure("The specification rows did not submit cleanly.");
  }

  const specs: Record<string, string> = {};
  for (let index = 0; index < keys.length; index += 1) {
    const key = (keys[index] ?? "").trim();
    const value = (values[index] ?? "").trim();

    if (key.length === 0 && value.length === 0) {
      continue;
    }
    if (key.length === 0) {
      return failure("Every specification needs a name.");
    }
    if (key.length > MAX_SPEC_KEY) {
      return failure(`Specification names are limited to ${MAX_SPEC_KEY} characters.`);
    }
    if (value.length > MAX_SPEC_VALUE) {
      return failure(`Specification values are limited to ${MAX_SPEC_VALUE} characters.`);
    }
    if (value.length === 0) {
      continue;
    }
    if (Object.hasOwn(specs, key)) {
      return failure(`Specification "${key}" appears twice.`);
    }
    specs[key] = value;
  }

  if (Object.keys(specs).length > MAX_SPECS) {
    return failure(`A product can have at most ${MAX_SPECS} specifications.`);
  }

  return { ok: true, specs };
}

export interface SaveProductDetailsInput {
  productId: string;
  title: string;
  description: string;
  actorId: string;
}

export async function saveProductDetails({
  productId,
  title,
  description,
  actorId,
}: SaveProductDetailsInput): Promise<AdminMutationResult> {
  if (!isUuid(productId)) {
    return failure("Product not found.");
  }

  const cleanTitle = title.trim();
  const cleanDescription = description.trim();
  if (cleanTitle.length === 0) {
    return failure("Title is required.");
  }
  if (cleanTitle.length > MAX_TITLE) {
    return failure(`Title is limited to ${MAX_TITLE} characters.`);
  }
  if (cleanDescription.length > MAX_DESCRIPTION) {
    return failure(`Description is limited to ${MAX_DESCRIPTION} characters.`);
  }

  return db.$transaction(async (tx): Promise<AdminMutationResult> => {
    const product = await tx.product.findUnique({
      where: { id: productId },
      select: { id: true, title: true, description: true },
    });
    if (product === null) {
      return failure("Product not found.");
    }

    if (
      product.title === cleanTitle &&
      product.description === cleanDescription
    ) {
      return { ok: true, changed: false };
    }

    await tx.product.update({
      where: { id: product.id },
      data: { title: cleanTitle, description: cleanDescription },
    });

    await recordAudit(tx, {
      actorId,
      action: "product.details_updated",
      entity: "Product",
      entityId: product.id,
      detail: {
        title: { from: product.title, to: cleanTitle },
        description: { from: product.description, to: cleanDescription },
      },
    });

    return { ok: true, changed: true };
  });
}

export interface SaveProductSpecsInput {
  productId: string;
  specs: Record<string, string>;
  actorId: string;
}

export async function saveProductSpecs({
  productId,
  specs,
  actorId,
}: SaveProductSpecsInput): Promise<AdminMutationResult> {
  if (!isUuid(productId)) {
    return failure("Product not found.");
  }

  return db.$transaction(async (tx): Promise<AdminMutationResult> => {
    const product = await tx.product.findUnique({
      where: { id: productId },
      select: { id: true, specs: true },
    });
    if (product === null) {
      return failure("Product not found.");
    }

    const before = specRowsFromJson(product.specs);
    const beforeSignature = JSON.stringify(before);
    const afterSignature = JSON.stringify(
      Object.entries(specs).map(([key, value]) => ({ key, value })),
    );

    if (beforeSignature === afterSignature) {
      return { ok: true, changed: false };
    }

    await tx.product.update({
      where: { id: product.id },
      data: { specs: specs as Prisma.InputJsonValue },
    });

    await recordAudit(tx, {
      actorId,
      action: "product.specs_updated",
      entity: "Product",
      entityId: product.id,
      detail: { specs },
    });

    return { ok: true, changed: true };
  });
}

interface VariantUpdate {
  id: string;
  priceCents: number;
  stock: number;
}

export interface SaveProductVariantsInput {
  productId: string;
  formData: FormData;
  actorId: string;
}

// The form submits three parallel lists: one hidden variant id per row, then
// the matching price and stock inputs in document order.
export async function saveProductVariants({
  productId,
  formData,
  actorId,
}: SaveProductVariantsInput): Promise<AdminMutationResult> {
  if (!isUuid(productId)) {
    return failure("Product not found.");
  }

  const ids = formData.getAll("variantId").map(String);
  const prices = formData.getAll("priceCents").map(String);
  const stocks = formData.getAll("stock").map(String);

  if (ids.length === 0 || ids.length !== prices.length || ids.length !== stocks.length) {
    return failure("The variant rows did not submit cleanly.");
  }
  if (new Set(ids).size !== ids.length) {
    return failure("The variant rows did not submit cleanly.");
  }

  const updates: VariantUpdate[] = [];
  for (let index = 0; index < ids.length; index += 1) {
    const id = ids[index] ?? "";
    const priceCents = parseIntegerField(prices[index] ?? "");
    const stock = parseIntegerField(stocks[index] ?? "");

    if (!isUuid(id)) {
      return failure("The variant rows did not submit cleanly.");
    }
    if (priceCents === null || priceCents > MAX_PRICE_CENTS) {
      return failure(
        `Price must be a whole number of cents between 0 and ${MAX_PRICE_CENTS}.`,
      );
    }
    if (stock === null || stock > MAX_STOCK) {
      return failure(
        `Stock must be a whole number between 0 and ${MAX_STOCK}.`,
      );
    }

    updates.push({ id, priceCents, stock });
  }

  return db.$transaction(async (tx): Promise<AdminMutationResult> => {
    const variants = await tx.variant.findMany({
      where: { productId },
      orderBy: { position: "asc" },
      select: { id: true, sku: true, priceCents: true, stock: true },
    });

    const byId = new Map(variants.map((variant) => [variant.id, variant]));
    if (
      variants.length !== updates.length ||
      updates.some((update) => !byId.has(update.id))
    ) {
      return failure("The variant rows did not submit cleanly.");
    }

    const changed = updates
      .map((update) => ({ update, before: byId.get(update.id) }))
      .filter(
        (entry) =>
          entry.before !== undefined &&
          (entry.before.priceCents !== entry.update.priceCents ||
            entry.before.stock !== entry.update.stock),
      );

    if (changed.length === 0) {
      return { ok: true, changed: false };
    }

    for (const entry of changed) {
      if (entry.before === undefined) {
        continue;
      }
      await tx.variant.update({
        where: { id: entry.update.id },
        data: {
          priceCents: entry.update.priceCents,
          stock: entry.update.stock,
        },
      });
    }

    // One save is one mutation, even when it touches several variants.
    await recordAudit(tx, {
      actorId,
      action: "product.variants_updated",
      entity: "Product",
      entityId: productId,
      detail: {
        variants: changed.map((entry) => ({
          id: entry.update.id,
          sku: entry.before?.sku ?? "",
          priceCents: {
            from: entry.before?.priceCents ?? null,
            to: entry.update.priceCents,
          },
          stock: {
            from: entry.before?.stock ?? null,
            to: entry.update.stock,
          },
        })),
      },
    });

    return { ok: true, changed: true };
  });
}

export interface SaveProductImagesInput {
  productId: string;
  formData: FormData;
  actorId: string;
}

export async function saveProductImages({
  productId,
  formData,
  actorId,
}: SaveProductImagesInput): Promise<AdminMutationResult> {
  if (!isUuid(productId)) {
    return failure("Product not found.");
  }

  return db.$transaction(async (tx): Promise<AdminMutationResult> => {
    const images = await tx.productImage.findMany({
      where: { productId },
      orderBy: { position: "asc" },
      select: { id: true, url: true, position: true },
    });

    if (images.length === 0) {
      return { ok: true, changed: false };
    }

    const positions: number[] = [];
    for (const image of images) {
      if (!formData.has(`position_${image.id}`)) {
        return failure("The image rows did not submit cleanly.");
      }
      const position = parseIntegerField(
        String(formData.get(`position_${image.id}`) ?? ""),
      );
      if (position === null || position > 10_000) {
        return failure("Each image needs a whole-number position.");
      }
      positions.push(position);
    }

    const ordered = images
      .map((image, index) => ({
        image,
        requested: positions[index] ?? image.position,
      }))
      .sort(
        (a, b) =>
          a.requested - b.requested ||
          a.image.position - b.image.position ||
          a.image.id.localeCompare(b.image.id),
      );

    const changed =
      ordered.some((entry, index) => entry.image.id !== images[index]?.id) ||
      ordered.some((entry, index) => entry.image.position !== index);

    if (!changed) {
      return { ok: true, changed: false };
    }

    for (const [index, entry] of ordered.entries()) {
      if (entry.image.position !== index) {
        await tx.productImage.update({
          where: { id: entry.image.id },
          data: { position: index },
        });
      }
    }

    await recordAudit(tx, {
      actorId,
      action: "product.images_reordered",
      entity: "Product",
      entityId: productId,
      detail: {
        order: ordered.map((entry, index) => ({
          id: entry.image.id,
          url: entry.image.url,
          position: index,
        })),
      },
    });

    return { ok: true, changed: true };
  });
}

export interface SetProductArchivedInput {
  productId: string;
  archived: boolean;
  actorId: string;
}

export async function setProductArchived({
  productId,
  archived,
  actorId,
}: SetProductArchivedInput): Promise<AdminMutationResult> {
  if (!isUuid(productId)) {
    return failure("Product not found.");
  }

  const target: ProductStatus = archived ? "ARCHIVED" : "ACTIVE";

  return db.$transaction(async (tx): Promise<AdminMutationResult> => {
    const product = await tx.product.findUnique({
      where: { id: productId },
      select: { id: true, title: true, status: true },
    });
    if (product === null) {
      return failure("Product not found.");
    }

    if (product.status === target) {
      return { ok: true, changed: false };
    }

    await tx.product.update({
      where: { id: product.id },
      data: { status: target },
    });

    // No order rows are touched. Their names, SKUs and prices are snapshots.
    await recordAudit(tx, {
      actorId,
      action: archived ? "product.archived" : "product.restored",
      entity: "Product",
      entityId: product.id,
      detail: {
        title: product.title,
        from: product.status,
        to: target,
      },
    });

    return { ok: true, changed: true };
  });
}

export interface SaveVariantStockInput {
  variantId: string;
  stock: number;
  actorId: string;
}

export async function saveVariantStock({
  variantId,
  stock,
  actorId,
}: SaveVariantStockInput): Promise<AdminMutationResult> {
  if (!isUuid(variantId)) {
    return failure("Variant not found.");
  }
  if (!Number.isInteger(stock) || stock < 0 || stock > MAX_STOCK) {
    return failure(`Stock must be a whole number between 0 and ${MAX_STOCK}.`);
  }

  return db.$transaction(async (tx): Promise<AdminMutationResult> => {
    const variant = await tx.variant.findUnique({
      where: { id: variantId },
      select: { id: true, sku: true, stock: true },
    });
    if (variant === null) {
      return failure("Variant not found.");
    }

    if (variant.stock === stock) {
      return { ok: true, changed: false };
    }

    await tx.variant.update({
      where: { id: variant.id },
      data: { stock },
    });

    await recordAudit(tx, {
      actorId,
      action: "variant.stock_updated",
      entity: "Variant",
      entityId: variant.id,
      detail: { sku: variant.sku, from: variant.stock, to: stock },
    });

    return { ok: true, changed: true };
  });
}
