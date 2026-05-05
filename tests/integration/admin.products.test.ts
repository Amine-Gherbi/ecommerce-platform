import { randomUUID } from "node:crypto";

import { beforeEach, describe, expect, it } from "vitest";

import {
  saveProductDetails,
  saveProductImages,
  saveProductSpecs,
  saveProductVariants,
  saveVariantStock,
  setProductArchived,
} from "@/lib/admin-products";

import { createPendingOrder, resetDatabase, testDb } from "./helpers";

async function createAdmin(): Promise<string> {
  const user = await testDb.user.create({
    data: {
      email: `admin-${randomUUID()}@example.test`,
      passwordHash: "not-used-in-integration-tests",
      name: "Test Admin",
      role: "ADMIN",
    },
    select: { id: true },
  });
  return user.id;
}

async function productIdForVariant(variantId: string): Promise<string> {
  const variant = await testDb.variant.findUniqueOrThrow({
    where: { id: variantId },
    select: { productId: true },
  });
  return variant.productId;
}

function variantForm(
  entries: readonly { id: string; priceCents: number; stock: number }[],
): FormData {
  const form = new FormData();
  for (const entry of entries) {
    form.append("variantId", entry.id);
    form.append("priceCents", String(entry.priceCents));
    form.append("stock", String(entry.stock));
  }
  return form;
}

describe("admin product mutations", () => {
  beforeEach(async () => {
    await resetDatabase();
  });

  it("writes one audit row per section save", async () => {
    const actorId = await createAdmin();
    const { variantId } = await createPendingOrder();
    const productId = await productIdForVariant(variantId);

    const details = await saveProductDetails({
      productId,
      title: "Edited product",
      description: "Edited description",
      actorId,
    });
    expect(details.ok).toBe(true);

    const specs = await saveProductSpecs({
      productId,
      specs: { Driver: "40 mm", Impedance: "32 ohms" },
      actorId,
    });
    expect(specs.ok).toBe(true);

    const variants = await saveProductVariants({
      productId,
      formData: variantForm([
        { id: variantId, priceCents: 12_345, stock: 7 },
      ]),
      actorId,
    });
    expect(variants.ok).toBe(true);

    const stock = await saveVariantStock({
      variantId,
      stock: 2,
      actorId,
    });
    expect(stock.ok).toBe(true);

    const stored = await testDb.product.findUniqueOrThrow({
      where: { id: productId },
      select: { title: true, description: true, specs: true },
    });
    expect(stored.title).toBe("Edited product");
    expect(stored.description).toBe("Edited description");
    expect(stored.specs).toEqual({ Driver: "40 mm", Impedance: "32 ohms" });

    const variant = await testDb.variant.findUniqueOrThrow({
      where: { id: variantId },
      select: { priceCents: true, stock: true },
    });
    expect(variant).toEqual({ priceCents: 12_345, stock: 2 });

    expect(
      await testDb.auditLog.count({
        where: { entity: "Product", entityId: productId },
      }),
    ).toBe(3);
    expect(
      await testDb.auditLog.count({
        where: { entity: "Variant", entityId: variantId },
      }),
    ).toBe(1);
  });

  it("changes the variant price without changing an existing order", async () => {
    const actorId = await createAdmin();
    const { order, variantId } = await createPendingOrder({
      priceCents: 2_000,
      quantity: 1,
    });
    const productId = await productIdForVariant(variantId);

    const itemBefore = await testDb.orderItem.findFirstOrThrow({
      where: { orderId: order.id },
      select: { sku: true, nameSnapshot: true, unitPriceCents: true },
    });
    const orderBefore = await testDb.order.findUniqueOrThrow({
      where: { id: order.id },
      select: { totalCents: true, subtotalCents: true },
    });

    const result = await saveProductVariants({
      productId,
      formData: variantForm([
        { id: variantId, priceCents: 9_900, stock: 3 },
      ]),
      actorId,
    });
    expect(result.ok).toBe(true);

    const variant = await testDb.variant.findUniqueOrThrow({
      where: { id: variantId },
      select: { priceCents: true },
    });
    expect(variant.priceCents).toBe(9_900);

    const itemAfter = await testDb.orderItem.findFirstOrThrow({
      where: { orderId: order.id },
      select: { sku: true, nameSnapshot: true, unitPriceCents: true },
    });
    const orderAfter = await testDb.order.findUniqueOrThrow({
      where: { id: order.id },
      select: { totalCents: true, subtotalCents: true },
    });

    expect(itemAfter).toEqual(itemBefore);
    expect(orderAfter).toEqual(orderBefore);
  });

  it("archives without touching the order and restores on request", async () => {
    const actorId = await createAdmin();
    const { order, variantId } = await createPendingOrder();
    const productId = await productIdForVariant(variantId);

    const itemBefore = await testDb.orderItem.findFirstOrThrow({
      where: { orderId: order.id },
      select: { nameSnapshot: true, unitPriceCents: true, quantity: true },
    });

    const archived = await setProductArchived({
      productId,
      archived: true,
      actorId,
    });
    expect(archived.ok).toBe(true);

    const stored = await testDb.product.findUniqueOrThrow({
      where: { id: productId },
      select: { status: true },
    });
    expect(stored.status).toBe("ARCHIVED");

    // The storefront reads only ACTIVE products.
    expect(
      await testDb.product.findFirst({
        where: { id: productId, status: "ACTIVE" },
        select: { id: true },
      }),
    ).toBeNull();

    const itemAfter = await testDb.orderItem.findFirstOrThrow({
      where: { orderId: order.id },
      select: { nameSnapshot: true, unitPriceCents: true, quantity: true },
    });
    expect(itemAfter).toEqual(itemBefore);

    const audit = await testDb.auditLog.findFirstOrThrow({
      where: { entity: "Product", entityId: productId },
    });
    expect(audit.action).toBe("product.archived");

    const restored = await setProductArchived({
      productId,
      archived: false,
      actorId,
    });
    expect(restored.ok).toBe(true);

    const active = await testDb.product.findFirst({
      where: { id: productId, status: "ACTIVE" },
      select: { id: true },
    });
    expect(active?.id).toBe(productId);
  });

  it("reorders images and records the new order", async () => {
    const actorId = await createAdmin();
    const { variantId } = await createPendingOrder();
    const productId = await productIdForVariant(variantId);

    const first = await testDb.productImage.create({
      data: {
        productId,
        url: "/products/first.jpg",
        alt: "First",
        position: 0,
      },
      select: { id: true },
    });
    const second = await testDb.productImage.create({
      data: {
        productId,
        url: "/products/second.jpg",
        alt: "Second",
        position: 1,
      },
      select: { id: true },
    });

    const form = new FormData();
    form.append(`position_${first.id}`, "1");
    form.append(`position_${second.id}`, "0");

    const result = await saveProductImages({ productId, formData: form, actorId });
    expect(result.ok).toBe(true);

    const images = await testDb.productImage.findMany({
      where: { productId },
      orderBy: { position: "asc" },
      select: { id: true },
    });
    expect(images.map((image) => image.id)).toEqual([second.id, first.id]);

    const audit = await testDb.auditLog.findFirstOrThrow({
      where: { entity: "Product", entityId: productId },
    });
    expect(audit.action).toBe("product.images_reordered");
  });
});
