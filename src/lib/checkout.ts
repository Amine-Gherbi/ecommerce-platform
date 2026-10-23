import { createHash } from "node:crypto";

import type { OrderStatus } from "@prisma/client";

import { db } from "@/lib/db";
import { isUniqueViolation } from "@/lib/prisma-errors";
import { computeTotals } from "@/lib/pricing";
import {
  createPaymentIntentForOrder,
  retrievePaymentIntent,
} from "@/lib/stripe";

// Checkout core: everything that can be checked without a Request or a session.
//
// The request body is never evidence. It supplies an address and the cart
// version the client was shown; prices, quantities, totals, stock and currency
// are read from Postgres inside one transaction. The unique index on
// `(userId, idempotencyKey)` — not a read-then-write check — decides which
// concurrent submit wins; the loser returns the winner's order.

export const RESERVATION_TTL_MS = 30 * 60 * 1_000;
export const CHECKOUT_CURRENCY = "usd";

export type CheckoutErrorCode =
  | "INVALID_BODY"
  | "CART_NOT_FOUND"
  | "CART_CHANGED"
  | "CART_EMPTY"
  | "OUT_OF_STOCK";

export class CheckoutError extends Error {
  constructor(
    readonly code: CheckoutErrorCode,
    readonly status: number,
    message: string,
  ) {
    super(message);
    this.name = "CheckoutError";
  }
}

export interface CartLineRef {
  variantId: string;
  quantity: number;
}

export interface CheckoutRequestBody {
  addressId: string;
  cartVersion: string;
}

export interface CheckoutInput extends CheckoutRequestBody {
  userId: string;
  cartId: string;
}

export interface OrderSummary {
  id: string;
  status: OrderStatus;
  subtotalCents: number;
  discountCents: number;
  totalCents: number;
  currency: string;
}

export interface CheckoutPaymentIntent {
  id: string;
  clientSecret: string | null;
  amountCents: number;
  live: boolean;
}

export interface CheckoutResult {
  order: OrderSummary;
  created: boolean;
  paymentIntent: CheckoutPaymentIntent;
}

function sha256Hex(value: string): string {
  return createHash("sha256").update(value, "utf8").digest("hex");
}

function compareIds(a: string, b: string): number {
  if (a < b) return -1;
  if (a > b) return 1;
  return 0;
}

/**
 * The cart version the client echoes back.
 *
 * It is a content hash, not a counter: the schema has no version column, and a
 * counter would need a write on every cart mutation. Two reads of the same
 * lines therefore produce the same version — which is exactly what makes two
 * concurrent submits collapse into one idempotency key.
 */
export function cartVersionOf(lines: readonly CartLineRef[]): string {
  const canonical = [...lines]
    .filter((line) => line.quantity > 0)
    .sort((a, b) => compareIds(a.variantId, b.variantId))
    .map((line) => `${line.variantId}:${line.quantity}`)
    .join("|");
  return sha256Hex(canonical);
}

export function checkoutIdempotencyKey(
  cartId: string,
  cartVersion: string,
): string {
  return sha256Hex(`${cartId}:${cartVersion}`);
}

/** Recomputes the version from the database; `null` when the cart is gone. */
export async function getCartVersion(cartId: string): Promise<string | null> {
  const cart = await db.cart.findUnique({
    where: { id: cartId },
    select: {
      items: { select: { variantId: true, quantity: true } },
    },
  });
  return cart === null ? null : cartVersionOf(cart.items);
}

/**
 * Accepts exactly `{addressId, cartVersion}`.
 *
 * Anything else in the body — `totalCents`, `unitPriceCents`, an item list —
 * is ignored by construction. There is no branch that reads it.
 */
export function parseCheckoutBody(value: unknown): CheckoutRequestBody {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new CheckoutError("INVALID_BODY", 400, "Expected a JSON object");
  }
  const record = value as Record<string, unknown>;
  const addressId = record.addressId;
  const cartVersion = record.cartVersion;

  if (
    typeof addressId !== "string" ||
    addressId.trim().length === 0 ||
    addressId.length > 128
  ) {
    throw new CheckoutError(
      "INVALID_BODY",
      400,
      "addressId must be a non-empty string",
    );
  }
  if (
    typeof cartVersion !== "string" ||
    !/^[0-9a-f]{64}$/.test(cartVersion)
  ) {
    throw new CheckoutError(
      "INVALID_BODY",
      400,
      "cartVersion must be a sha256 hex string",
    );
  }

  return { addressId: addressId.trim(), cartVersion };
}

interface TransactionOutcome {
  order: OrderSummary;
  created: boolean;
}

interface TransactionLine {
  variantId: string;
  sku: string;
  name: string;
  priceCents: number;
  stock: number;
  quantity: number;
}

const ORDER_SELECT = {
  id: true,
  status: true,
  subtotalCents: true,
  discountCents: true,
  totalCents: true,
  currency: true,
} as const;

async function runOrderTransaction(
  input: CheckoutInput,
  idempotencyKey: string,
): Promise<TransactionOutcome> {
  try {
    return await db.$transaction(
      async (tx) => {
        const now = new Date();
        const cart = await tx.cart.findUnique({
          where: { id: input.cartId },
          include: {
            items: {
              include: {
                variant: {
                  select: {
                    id: true,
                    sku: true,
                    name: true,
                    priceCents: true,
                    stock: true,
                    archivedAt: true,
                  },
                },
              },
            },
          },
        });

        if (
          cart === null ||
          cart.userId !== input.userId ||
          cart.expiresAt.getTime() <= now.getTime()
        ) {
          throw new CheckoutError(
            "CART_NOT_FOUND",
            409,
            "Cart is missing, expired, or belongs to another account",
          );
        }

        // The version covers every stored line, archived ones included, so an
        // archived variant forces a reload instead of silently changing the
        // order behind the customer's back.
        const version = cartVersionOf(
          cart.items.map((item) => ({
            variantId: item.variantId,
            quantity: item.quantity,
          })),
        );
        if (version !== input.cartVersion) {
          throw new CheckoutError(
            "CART_CHANGED",
            409,
            "Cart changed since it was priced; reload and try again",
          );
        }

        if (cart.items.some((item) => item.variant.archivedAt !== null)) {
          throw new CheckoutError(
            "CART_CHANGED",
            409,
            "Cart contains an unavailable item",
          );
        }

        const lines: TransactionLine[] = cart.items
          .filter((item) => item.quantity > 0)
          .map((item) => ({
            variantId: item.variant.id,
            sku: item.variant.sku,
            name: item.variant.name,
            priceCents: item.variant.priceCents,
            stock: item.variant.stock,
            quantity: item.quantity,
          }));

        if (lines.length === 0) {
          throw new CheckoutError("CART_EMPTY", 400, "Cart has no lines");
        }

        // Advisory pre-check for a clean 409. It is not the guard: the
        // conditional UPDATE below is, because this value can go stale the
        // instant another checkout commits.
        for (const line of lines) {
          if (line.quantity > line.stock) {
            throw new CheckoutError(
              "OUT_OF_STOCK",
              409,
              `Insufficient stock for ${line.sku}`,
            );
          }
        }

        // `availableStock` equals the requested quantity: the total must price
        // what was asked for, never a silently truncated amount.
        const totals = computeTotals(
          lines.map((line) => ({
            unitPriceCents: line.priceCents,
            quantity: line.quantity,
            availableStock: line.quantity,
          })),
        );

        // One lock order for every checkout: ascending variant id. Without it,
        // two carts sharing variants can deadlock (40P01) instead of losing a
        // stock race cleanly.
        const sorted = [...lines].sort((a, b) =>
          compareIds(a.variantId, b.variantId),
        );

        const order = await tx.order.create({
          data: {
            userId: input.userId,
            status: "PENDING",
            idempotencyKey,
            subtotalCents: totals.subtotalCents,
            discountCents: totals.discountCents,
            totalCents: totals.totalCents,
            currency: CHECKOUT_CURRENCY,
            items: {
              create: sorted.map((line) => ({
                variantId: line.variantId,
                sku: line.sku,
                nameSnapshot: line.name,
                unitPriceCents: line.priceCents,
                quantity: line.quantity,
              })),
            },
          },
          select: ORDER_SELECT,
        });

        const expiresAt = new Date(now.getTime() + RESERVATION_TTL_MS);
        for (const line of sorted) {
          const updated = await tx.$executeRaw`
            UPDATE "Variant"
            SET stock = stock - ${line.quantity}, "updatedAt" = now()
            WHERE id = ${line.variantId}::uuid
              AND stock >= ${line.quantity}
          `;
          if (updated !== 1) {
            // Throwing rolls back the order row and every earlier stock
            // decrement in this transaction.
            throw new CheckoutError(
              "OUT_OF_STOCK",
              409,
              `Insufficient stock for ${line.sku}`,
            );
          }
          await tx.stockReservation.create({
            data: {
              orderId: order.id,
              variantId: line.variantId,
              qty: line.quantity,
              expiresAt,
            },
          });
        }

        return { order, created: true } satisfies TransactionOutcome;
      },
      { maxWait: 20_000, timeout: 20_000 },
    );
  } catch (error: unknown) {
    if (!isUniqueViolation(error)) {
      throw error;
    }
    // Someone else committed the same (userId, idempotencyKey) first. The
    // winner's row is the answer; a duplicate is a replay, not a conflict.
    const existing = await db.order.findUnique({
      where: {
        userId_idempotencyKey: {
          userId: input.userId,
          idempotencyKey,
        },
      },
      select: ORDER_SELECT,
    });
    if (existing !== null) {
      return { order: existing, created: false };
    }
    throw error;
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Makes sure the order has exactly one PaymentIntent and returns its secret.
 *
 * First submission creates it with `idempotencyKey: 'pi_' + order.id'` and
 * persists the id immediately. A replay — including the loser of a
 * double-submit — retrieves the persisted intent instead of creating a second.
 */
async function ensurePaymentIntent(
  order: OrderSummary,
): Promise<CheckoutPaymentIntent> {
  const current = await db.order.findUnique({
    where: { id: order.id },
    select: { stripePaymentIntentId: true },
  });

  if (current?.stripePaymentIntentId != null) {
    const ref = await retrievePaymentIntent(current.stripePaymentIntentId);
    return {
      id: ref.id,
      clientSecret: ref.clientSecret,
      amountCents: order.totalCents,
      live: ref.live,
    };
  }

  let created;
  try {
    created = await createPaymentIntentForOrder({
      orderId: order.id,
      amountCents: order.totalCents,
      currency: order.currency,
    });
  } catch (error: unknown) {
    // A concurrent replay may have won the create; give it a moment to commit
    // its id, then reuse it rather than surfacing a transient failure.
    for (let attempt = 0; attempt < 3; attempt += 1) {
      await sleep(50);
      const raced = await db.order.findUnique({
        where: { id: order.id },
        select: { stripePaymentIntentId: true },
      });
      if (raced?.stripePaymentIntentId != null) {
        const ref = await retrievePaymentIntent(raced.stripePaymentIntentId);
        return {
          id: ref.id,
          clientSecret: ref.clientSecret,
          amountCents: order.totalCents,
          live: ref.live,
        };
      }
    }
    throw error;
  }

  await db.order.update({
    where: { id: order.id },
    data: { stripePaymentIntentId: created.id },
  });

  return {
    id: created.id,
    clientSecret: created.clientSecret,
    amountCents: created.amountCents,
    live: created.live,
  };
}

export async function performCheckout(
  input: CheckoutInput,
): Promise<CheckoutResult> {
  const idempotencyKey = checkoutIdempotencyKey(
    input.cartId,
    input.cartVersion,
  );
  const outcome = await runOrderTransaction(input, idempotencyKey);
  const paymentIntent = await ensurePaymentIntent(outcome.order);
  return {
    order: outcome.order,
    created: outcome.created,
    paymentIntent,
  };
}
