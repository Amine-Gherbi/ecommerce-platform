import { execSync } from "node:child_process";
import { randomUUID } from "node:crypto";

import { db } from "@/lib/db";
import { getCartVersion, performCheckout } from "@/lib/checkout";

// Database fixtures for the checkout and webhook suites. Every row is tagged
// with a random suffix and removed in `afterAll`; nothing here touches the
// development database (tests/setup-env.ts forces shop_test).

export interface CatalogFixture {
  categoryId: string;
  productId: string;
  variantId: string;
  sku: string;
  priceCents: number;
}

export function runMigrations(): void {
  execSync("npx --no-install prisma migrate deploy", {
    cwd: process.cwd(),
    env: process.env,
    stdio: "pipe",
    timeout: 110_000,
  });
}

export async function createCatalog(options: {
  stock: number;
  priceCents: number;
  label: string;
}): Promise<CatalogFixture> {
  const suffix = randomUUID().slice(0, 8);
  const categoryId = randomUUID();
  const productId = randomUUID();
  const variantId = randomUUID();
  const sku = `P2-M4-${options.label.toUpperCase()}-${suffix}`;

  await db.category.create({
    data: {
      id: categoryId,
      slug: `p2-m4-${options.label}-${suffix}`,
      name: `M4 ${options.label}`,
    },
  });
  await db.product.create({
    data: {
      id: productId,
      slug: `p2-m4-${options.label}-product-${suffix}`,
      name: `M4 ${options.label} product`,
      description: "Checkout fixture product.",
      categoryId,
    },
  });
  await db.variant.create({
    data: {
      id: variantId,
      productId,
      sku,
      name: "Default",
      priceCents: options.priceCents,
      stock: options.stock,
    },
  });

  return {
    categoryId,
    productId,
    variantId,
    sku,
    priceCents: options.priceCents,
  };
}

export async function createUsers(
  label: string,
  count: number,
): Promise<string[]> {
  const suffix = randomUUID().slice(0, 8);
  const ids = Array.from({ length: count }, () => randomUUID());
  await db.user.createMany({
    data: ids.map((id, index) => ({
      id,
      email: `p2-m4-${label}-${suffix}-${index}@example.test`,
    })),
  });
  return ids;
}

export interface CartFixture {
  cartId: string;
  cartVersion: string;
}

export async function createCart(
  userId: string,
  items: ReadonlyArray<{ variantId: string; quantity: number }>,
): Promise<CartFixture> {
  const cartId = randomUUID();
  await db.cart.create({
    data: {
      id: cartId,
      userId,
      expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1_000),
    },
  });
  for (const item of items) {
    await db.cartItem.create({
      data: {
        cartId,
        variantId: item.variantId,
        quantity: item.quantity,
      },
    });
  }

  const cartVersion = await getCartVersion(cartId);
  if (cartVersion === null) {
    throw new Error("cart vanished immediately after creation");
  }
  return { cartId, cartVersion };
}

export interface PendingOrderFixture {
  orderId: string;
  paymentIntentId: string;
  totalCents: number;
  cartId: string;
  cartVersion: string;
}

/**
 * Drives the real checkout core and leaves a PENDING order with a reserved
 * unit and a persisted payment intent — the starting state every webhook
 * test needs.
 */
export async function createPendingOrder(
  userId: string,
  variantId: string,
  quantity: number,
): Promise<PendingOrderFixture> {
  const cart = await createCart(userId, [{ variantId, quantity }]);
  const result = await performCheckout({
    userId,
    cartId: cart.cartId,
    addressId: randomUUID(),
    cartVersion: cart.cartVersion,
  });

  const paymentIntentId = result.paymentIntent.id;
  if (paymentIntentId.length === 0) {
    throw new Error("checkout returned no payment intent id");
  }

  return {
    orderId: result.order.id,
    paymentIntentId,
    totalCents: result.order.totalCents,
    cartId: cart.cartId,
    cartVersion: cart.cartVersion,
  };
}

export interface FixtureCleanupInput {
  userIds: readonly string[];
  catalogs: readonly CatalogFixture[];
  webhookEventIds?: readonly string[];
}

export async function cleanupFixture(
  input: FixtureCleanupInput,
): Promise<void> {
  const orders =
    input.userIds.length === 0
      ? []
      : await db.order.findMany({
          where: { userId: { in: [...input.userIds] } },
          select: { id: true },
        });
  const orderIds = orders.map((order) => order.id);

  if (orderIds.length > 0) {
    await db.stockReservation.deleteMany({
      where: { orderId: { in: orderIds } },
    });
    await db.orderItem.deleteMany({ where: { orderId: { in: orderIds } } });
    await db.order.deleteMany({ where: { id: { in: orderIds } } });
  }

  if (input.userIds.length > 0) {
    // CartItem cascades from Cart.
    await db.cart.deleteMany({ where: { userId: { in: [...input.userIds] } } });
    await db.user.deleteMany({ where: { id: { in: [...input.userIds] } } });
  }

  if (input.webhookEventIds !== undefined && input.webhookEventIds.length > 0) {
    await db.webhookEvent.deleteMany({
      where: { stripeEventId: { in: [...input.webhookEventIds] } },
    });
  }

  for (const catalog of input.catalogs) {
    await db.variant.deleteMany({ where: { id: catalog.variantId } });
    await db.product.delete({ where: { id: catalog.productId } });
    await db.category.delete({ where: { id: catalog.categoryId } });
  }
}

export async function orderStatus(orderId: string) {
  return db.order.findUnique({
    where: { id: orderId },
    select: {
      status: true,
      totalCents: true,
      currency: true,
      stripePaymentIntentId: true,
    },
  });
}
