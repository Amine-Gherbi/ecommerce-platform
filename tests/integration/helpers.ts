import { randomUUID } from "node:crypto";

import { PrismaClient, type DeliveryMethod } from "@prisma/client";
import Stripe from "stripe";

import {
  cartVersion,
  placeOrder,
  type CheckoutBody,
  type CheckoutOrder,
  type PlaceOrderDeps,
  type PlaceOrderResult,
} from "@/lib/checkout";

export const WEBHOOK_SECRET = "test-payments-webhook-secret-not-a-real-value";

// Integration tests inject a PaymentIntent creator: pricing, transaction
// boundaries and the persisted id are real, Stripe is not called.
export const testPaymentDeps: PlaceOrderDeps = {
  createPaymentIntent: async () => ({
    id: `pi_test_${randomUUID().replaceAll("-", "")}`,
    clientSecret: `pi_test_secret_${randomUUID().replaceAll("-", "")}`,
  }),
};

export function placeOrderForTest(
  body: CheckoutBody & { userId: string },
): Promise<PlaceOrderResult> {
  return placeOrder(body, testPaymentDeps);
}

// Integration tests share one database. `fileParallelism` is off in
// vitest.config.ts, so each file can reset at its own boundary.
export const testDb = new PrismaClient();

export async function resetDatabase(): Promise<void> {
  await testDb.$executeRawUnsafe(
    'TRUNCATE TABLE "WebhookEvent", "StockReservation", "OrderItem", "Order", "CartItem", "Cart", "ProductImage", "Variant", "Product", "Brand", "Category", "Address", "User" RESTART IDENTITY CASCADE',
  );
}

export async function createUser(): Promise<string> {
  const suffix = randomUUID();
  const user = await testDb.user.create({
    data: {
      email: `test-${suffix}@example.test`,
      passwordHash: "not-used-in-integration-tests",
      name: "Test Customer",
    },
    select: { id: true },
  });
  return user.id;
}

export async function createAddress(userId: string): Promise<string> {
  const address = await testDb.address.create({
    data: {
      userId,
      label: "Home",
      line1: "1 Rue de la République",
      city: "Lyon",
      postalCode: "69001",
      country: "France",
      isDefault: true,
    },
    select: { id: true },
  });
  return address.id;
}

export async function createVariant({
  priceCents,
  stock,
}: {
  priceCents: number;
  stock: number;
}): Promise<{ variantId: string; sku: string }> {
  const suffix = randomUUID();
  const category = await testDb.category.create({
    data: { slug: `test-category-${suffix}`, name: "Test", position: 0 },
  });
  const brand = await testDb.brand.create({
    data: { slug: `test-brand-${suffix}`, name: "Test Brand" },
  });
  const sku = `TEST-${suffix.slice(0, 8).toUpperCase()}`;
  const product = await testDb.product.create({
    data: {
      slug: `test-product-${suffix}`,
      title: "Test Product",
      brandId: brand.id,
      categoryId: category.id,
      description: "Fixture product",
      specs: {},
      status: "ACTIVE",
      variants: {
        create: {
          sku,
          title: "Standard",
          priceCents,
          stock,
          position: 0,
        },
      },
    },
    include: { variants: true },
  });

  const variant = product.variants[0];
  if (variant === undefined) {
    throw new Error("fixture product has no variant");
  }

  return { variantId: variant.id, sku: variant.sku };
}

export async function createCartWithLine({
  userId,
  variantId,
  quantity,
  deliveryMethod = "STANDARD",
}: {
  userId: string;
  variantId: string;
  quantity: number;
  deliveryMethod?: DeliveryMethod;
}): Promise<{ cartId: string; version: string }> {
  const cart = await testDb.cart.create({
    data: {
      userId,
      deliveryMethod,
      items: { create: { variantId, quantity } },
    },
    select: { id: true },
  });

  return {
    cartId: cart.id,
    version: cartVersion([{ variantId, quantity }]),
  };
}

export interface OrderAttempt {
  userId: string;
  addressId: string;
  cartVersion: string;
}

export interface PaymentEventData {
  paymentIntentId?: string | null;
  amountCents?: number;
  currency?: string;
}

export function paymentEvent(
  order: Pick<CheckoutOrder, "paymentIntentId" | "totalCents" | "currency">,
  eventId: string,
  overrides: PaymentEventData = {},
): string {
  return JSON.stringify({
    id: eventId,
    object: "event",
    type: "payment_intent.succeeded",
    data: {
      object: {
        id: overrides.paymentIntentId ?? order.paymentIntentId,
        object: "payment_intent",
        amount: overrides.amountCents ?? order.totalCents,
        currency: overrides.currency ?? order.currency,
      },
    },
  });
}

export function signedRequest(
  rawBody: string,
  options: {
    secret?: string;
    timestamp?: number;
    signature?: string;
  } = {},
): Request {
  const timestamp = options.timestamp ?? Math.floor(Date.now() / 1_000);
  const secret = options.secret ?? WEBHOOK_SECRET;
  const signature =
    options.signature ??
    Stripe.webhooks.generateTestHeaderString({
      payload: rawBody,
      secret,
      timestamp,
    });

  return new Request("http://localhost/api/webhooks/payments", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "stripe-signature": signature,
    },
    body: rawBody,
  });
}

export async function createPendingOrder({
  priceCents = 2_000,
  stock = 5,
  quantity = 1,
}: {
  priceCents?: number;
  stock?: number;
  quantity?: number;
} = {}): Promise<{
  order: CheckoutOrder;
  attempt: OrderAttempt;
  variantId: string;
  initialStock: number;
}> {
  const { variantId } = await createVariant({ priceCents, stock });
  const attempt = await createOrderAttempt({ variantId, quantity });
  const result = await placeOrderForTest(attempt);

  if (result.kind !== "created") {
    throw new Error(`expected a created order, got ${result.kind}`);
  }

  return { order: result.order, attempt, variantId, initialStock: stock };
}

export async function createOrderAttempt({
  variantId,
  quantity = 1,
  deliveryMethod = "STANDARD",
}: {
  variantId: string;
  quantity?: number;
  deliveryMethod?: DeliveryMethod;
}): Promise<OrderAttempt> {
  const userId = await createUser();
  const addressId = await createAddress(userId);
  const { version } = await createCartWithLine({
    userId,
    variantId,
    quantity,
    deliveryMethod,
  });

  return { userId, addressId, cartVersion: version };
}
