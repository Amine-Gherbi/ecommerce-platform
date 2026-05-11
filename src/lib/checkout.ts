// Checkout domain: the server prices every line, decrements stock with one
// conditional `UPDATE` per line (in variantId order, so multi-line carts lock
// in the same order), and lets the `(userId, idempotencyKey)` unique index
// decide a double submit.

import { createHash, randomUUID } from "node:crypto";

import type { DeliveryMethod, Prisma } from "@prisma/client";

import { db } from "@/lib/db";
import { shippingForSubtotal } from "@/lib/money";
import {
  createPaymentIntent as createStripePaymentIntent,
  type CreatedPaymentIntent,
  type PaymentIntentRequest,
} from "@/lib/stripe";

export interface CartLineKey {
  variantId: string;
  quantity: number;
}

export interface PricedLine extends CartLineKey {
  priceCents: number;
}

export interface CheckoutTotals {
  subtotalCents: number;
  shippingCents: number;
  totalCents: number;
}

export type CheckoutOrder = Prisma.OrderGetPayload<{
  include: { items: true };
}>;

export type PlaceOrderResult =
  | { kind: "created"; order: CheckoutOrder; clientSecret: string | null }
  | { kind: "duplicate"; order: CheckoutOrder }
  | { kind: "cart_changed" }
  | { kind: "no_cart" }
  | { kind: "invalid_address" }
  | { kind: "out_of_stock"; variantId: string };

export interface PlaceOrderDeps {
  createPaymentIntent(
    request: PaymentIntentRequest,
  ): Promise<CreatedPaymentIntent>;
}

// Production calls Stripe. Tests inject a creator so no suite reaches the
// network, while the transaction boundary stays the one under test.
const defaultDeps: PlaceOrderDeps = {
  createPaymentIntent: (request) => createStripePaymentIntent(request),
};

export interface CheckoutBody {
  addressId: string;
  cartVersion: string;
}

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const orderInclude = {
  items: { orderBy: { sku: "asc" } },
} satisfies Prisma.OrderInclude;

class OutOfStockError extends Error {
  readonly variantId: string;

  constructor(variantId: string) {
    super(`variant ${variantId} is out of stock`);
    this.name = "OutOfStockError";
    this.variantId = variantId;
  }
}

function compareVariantId(a: string, b: string): number {
  if (a < b) {
    return -1;
  }
  if (a > b) {
    return 1;
  }
  return 0;
}

// `cartVersion = sha256(canonical lines)`, a line being `variantId:quantity`
// sorted by variantId. Prices are deliberately absent: the server re-prices at
// commit time anyway, and a price change must not invalidate the shopper's
// preview. Two reads of the same basket produce the same hash, which is what
// makes the two halves of a double submit derive the same idempotency key.
export function cartVersion(lines: readonly CartLineKey[]): string {
  const canonical = [...lines]
    .sort((a, b) => compareVariantId(a.variantId, b.variantId))
    .map((line) => `${line.variantId}:${line.quantity}`)
    .join("\n");

  return createHash("sha256").update(canonical).digest("hex");
}

export function computeTotals(
  lines: readonly PricedLine[],
  deliveryMethod: DeliveryMethod,
): CheckoutTotals {
  const subtotalCents = lines.reduce((sum, line) => {
    if (!Number.isInteger(line.priceCents) || line.priceCents < 0) {
      throw new Error("priceCents must be a non-negative integer");
    }
    if (!Number.isInteger(line.quantity) || line.quantity < 1) {
      throw new Error("quantity must be a positive integer");
    }
    return sum + line.priceCents * line.quantity;
  }, 0);

  const shippingCents = shippingForSubtotal(subtotalCents, deliveryMethod);

  return {
    subtotalCents,
    shippingCents,
    totalCents: subtotalCents + shippingCents,
  };
}

// The checkout contract is exactly `{addressId, cartVersion}`. Everything else
// in the body — notably any price the client invents — is ignored rather than
// validated and rejected.
export function parseCheckoutBody(
  raw: unknown,
): ({ ok: true } & CheckoutBody) | { ok: false; error: string } {
  if (typeof raw !== "object" || raw === null || Array.isArray(raw)) {
    return { ok: false, error: "Body must be a JSON object." };
  }

  const record = raw as Record<string, unknown>;
  const addressId = record.addressId;
  const version = record.cartVersion;

  if (typeof addressId !== "string" || addressId.trim().length === 0) {
    return { ok: false, error: "addressId is required." };
  }
  if (typeof version !== "string" || version.length === 0 || version.length > 128) {
    return { ok: false, error: "cartVersion is required." };
  }

  return { ok: true, addressId: addressId.trim(), cartVersion: version };
}

function idempotencyKeyFor(cartId: string, version: string): string {
  return createHash("sha256").update(`${cartId}:${version}`).digest("hex");
}

function orderNumber(orderId: string): string {
  const now = new Date();
  const year = String(now.getUTCFullYear()).slice(-2);
  const month = String(now.getUTCMonth() + 1).padStart(2, "0");
  return `KST-${year}${month}-${orderId.replaceAll("-", "").slice(0, 8).toUpperCase()}`;
}

function hasPrismaCode(error: unknown, code: string): boolean {
  if (typeof error !== "object" || error === null) {
    return false;
  }
  const candidate = error as { code?: unknown };
  return candidate.code === code;
}

export async function placeOrder(
  { userId, addressId, cartVersion: submittedVersion }: CheckoutBody & { userId: string },
  deps: PlaceOrderDeps = defaultDeps,
): Promise<PlaceOrderResult> {
  const cart = await db.cart.findUnique({
    where: { userId },
    select: { id: true },
  });

  if (cart === null) {
    return { kind: "no_cart" };
  }

  const idempotencyKey = idempotencyKeyFor(cart.id, submittedVersion);

  try {
    return await db.$transaction(async (tx): Promise<PlaceOrderResult> => {
      const existing = await tx.order.findUnique({
        where: { userId_idempotencyKey: { userId, idempotencyKey } },
        include: orderInclude,
      });
      if (existing !== null) {
        return { kind: "duplicate", order: existing };
      }

      const record = await tx.cart.findUnique({
        where: { userId },
        include: {
          items: {
            orderBy: { variantId: "asc" },
            include: {
              variant: {
                include: {
                  product: { select: { status: true, title: true } },
                },
              },
            },
          },
        },
      });

      if (record === null || record.items.length === 0) {
        return { kind: "no_cart" };
      }

      for (const item of record.items) {
        if (item.quantity < 1) {
          return { kind: "cart_changed" };
        }
      }

      if (cartVersion(record.items) !== submittedVersion) {
        return { kind: "cart_changed" };
      }

      if (!UUID_PATTERN.test(addressId)) {
        return { kind: "invalid_address" };
      }

      const address = await tx.address.findFirst({
        where: { id: addressId, userId },
      });
      if (address === null) {
        return { kind: "invalid_address" };
      }

      // Nothing below may return early: every exit after the first stock
      // decrement must be a throw, so the transaction rolls the decrements
      // back together with the order row.
      for (const item of record.items) {
        if (item.variant.product.status !== "ACTIVE") {
          return { kind: "cart_changed" };
        }
      }

      const lines: PricedLine[] = record.items.map((item) => ({
        variantId: item.variantId,
        quantity: item.quantity,
        priceCents: item.variant.priceCents,
      }));
      const totals = computeTotals(lines, record.deliveryMethod);

      for (const item of record.items) {
        const decremented = await tx.$executeRaw`
          UPDATE "Variant"
          SET stock = stock - ${item.quantity}
          WHERE id = ${item.variantId}::uuid AND stock >= ${item.quantity}
        `;
        if (decremented !== 1) {
          throw new OutOfStockError(item.variantId);
        }
      }

      // The reservation window is the database's `now() + 30 minutes`, in the
      // same transaction as the decrement, so app/database clock skew cannot
      // shorten or extend it. The result is a `timestamptz`; Prisma stores the
      // Date it maps to in the naive `expiresAt timestamp(3)` column as UTC
      // wall-clock, which is the representation every later comparison uses.
      const [clock] = await tx.$queryRaw<Array<{ expiresAt: Date }>>`
        SELECT now() + interval '30 minutes' AS "expiresAt"
      `;
      if (clock === undefined) {
        throw new Error("database did not return a reservation clock");
      }
      const expiresAt = clock.expiresAt;

      const orderId = randomUUID();
      const number = orderNumber(orderId);

      // The amount is the one computed above from Variant.priceCents, and the
      // key is the checkout key: a retry resolves to the same intent. The call
      // sits inside the transaction so a Stripe failure rolls the stock back
      // and leaves no order without an intent.
      const intent = await deps.createPaymentIntent({
        amountCents: totals.totalCents,
        currency: "eur",
        orderId,
        orderNumber: number,
        idempotencyKey,
      });

      const order = await tx.order.create({
        data: {
          id: orderId,
          number,
          userId,
          status: "PENDING",
          subtotalCents: totals.subtotalCents,
          shippingCents: totals.shippingCents,
          totalCents: totals.totalCents,
          currency: "eur",
          idempotencyKey,
          address: {
            label: address.label,
            line1: address.line1,
            line2: address.line2,
            city: address.city,
            postalCode: address.postalCode,
            country: address.country,
          },
          deliveryMethod: record.deliveryMethod,
          paymentIntentId: intent.id,
          items: {
            create: record.items.map((item) => ({
              variantId: item.variantId,
              sku: item.variant.sku,
              nameSnapshot: `${item.variant.product.title} — ${item.variant.title}`,
              unitPriceCents: item.variant.priceCents,
              quantity: item.quantity,
            })),
          },
          reservations: {
            create: record.items.map((item) => ({
              variantId: item.variantId,
              quantity: item.quantity,
              expiresAt,
            })),
          },
        },
        include: orderInclude,
      });

      await tx.cartItem.deleteMany({ where: { cartId: record.id } });

      return { kind: "created", order, clientSecret: intent.clientSecret };
    });
  } catch (error: unknown) {
    if (error instanceof OutOfStockError) {
      return { kind: "out_of_stock", variantId: error.variantId };
    }

    // Both requests raced to insert the same key; Postgres made one wait for
    // the other to commit, then raised 23505. The winner's order is the answer
    // to the loser: a replay is a success, not a conflict.
    if (hasPrismaCode(error, "P2002")) {
      const existing = await db.order.findUnique({
        where: { userId_idempotencyKey: { userId, idempotencyKey } },
        include: orderInclude,
      });
      if (existing !== null) {
        return { kind: "duplicate", order: existing };
      }
    }

    throw error;
  }
}
