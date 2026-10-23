import type { OrderStatus, Prisma } from "@prisma/client";

import { db } from "@/lib/db";
import { allowedNextStatuses, isTransitionAllowed, releasesStock } from "@/lib/order-state";

// Order lifecycle primitives shared by the webhook, the reservation sweeper,
// the reconciliation job and the refund path.
//
// Every status change in this module is a compare-and-set:
//
//   UPDATE "Order" SET status = $target WHERE id = $id AND status = $from
//
// `updateMany` returns the row count, and the only correct reading of 0 is
// "someone else moved this order first". That is not an error: the caller logs
// it and answers 200. Never read-then-write, and never treat 0 rows as a
// reason to retry — a retry cannot win a race that has already been lost.

export type Tx = Prisma.TransactionClient;

export interface OrderMoney {
  id: string;
  status: OrderStatus;
  subtotalCents: number;
  discountCents: number;
  totalCents: number;
  currency: string;
}

/** The subset of a Stripe PaymentIntent the money check needs. */
export interface IntentMoney {
  currency: string;
  amount_received: number;
}

/**
 * The money check that must pass before an order may become PAID.
 *
 * Three independent facts: Stripe received the order's total in the order's
 * currency, the item snapshots still add up to the stored subtotal, and the
 * stored subtotal minus discount is the stored total. Any disagreement means
 * the two systems do not agree about money, which is never something to paper
 * over: the order goes to REFUND_REQUIRED instead.
 */
export async function settlesFully(
  tx: Tx,
  order: OrderMoney,
  intent: IntentMoney,
): Promise<boolean> {
  if (intent.currency.toLowerCase() !== order.currency.toLowerCase()) {
    return false;
  }
  if (intent.amount_received !== order.totalCents) {
    return false;
  }
  if (order.subtotalCents - order.discountCents !== order.totalCents) {
    return false;
  }

  const items = await tx.orderItem.findMany({
    where: { orderId: order.id },
    select: { unitPriceCents: true, quantity: true },
  });
  let itemSum = 0;
  for (const item of items) {
    itemSum += item.unitPriceCents * item.quantity;
  }
  return itemSum === order.subtotalCents;
}

export interface ReleaseSummary {
  reservations: number;
  units: number;
}

/**
 * Returns reserved units to the shelf. The reservation row is kept and stamped
 * `releasedAt`; deleting it would erase the audit trail. Calling this twice is
 * safe — only rows with `releasedAt IS NULL` are touched.
 */
export async function releaseReservations(
  tx: Tx,
  orderId: string,
): Promise<ReleaseSummary> {
  const reservations = await tx.stockReservation.findMany({
    where: { orderId, releasedAt: null },
    select: { id: true, variantId: true, qty: true },
    orderBy: { variantId: "asc" },
  });
  if (reservations.length === 0) {
    return { reservations: 0, units: 0 };
  }

  const releasedAt = new Date();
  let units = 0;
  for (const reservation of reservations) {
    await tx.variant.update({
      where: { id: reservation.variantId },
      data: { stock: { increment: reservation.qty } },
    });
    await tx.stockReservation.update({
      where: { id: reservation.id },
      data: { releasedAt },
    });
    units += reservation.qty;
  }
  return { reservations: reservations.length, units };
}

/**
 * Applies one transition as a single conditional UPDATE.
 *
 * Returns true when this caller won the compare-and-set, false when the order
 * was not in `from` (lost race, already processed, or never existed). Callers
 * must log false and continue; they must not retry.
 */
export async function applyTransition(
  tx: Tx,
  orderId: string,
  from: OrderStatus,
  to: OrderStatus,
): Promise<boolean> {
  const result = await tx.order.updateMany({
    where: { id: orderId, status: from },
    data: { status: to },
  });
  return result.count === 1;
}

export const RECONCILE_MIN_AGE_MS = 2 * 60 * 1_000;
export const RECONCILE_BATCH_SIZE = 100;

export type PaymentIntentStatus =
  | "requires_payment_method"
  | "requires_confirmation"
  | "requires_action"
  | "processing"
  | "requires_capture"
  | "canceled"
  | "succeeded";

/** The projection of a PaymentIntent that reconciliation is allowed to use. */
export interface PaymentIntentSnapshot {
  id: string;
  status: PaymentIntentStatus;
  amount: number;
  amount_received: number;
  currency: string;
}

/**
 * The Stripe surface the reconciliation job needs. Injecting it keeps the job
 * testable without a secret key and without a network call; the real
 * implementation lives in `src/lib/stripe.ts`.
 */
export interface PaymentIntentReader {
  retrievePaymentIntent(id: string): Promise<PaymentIntentSnapshot>;
}

export interface ReconcileOptions {
  now?: Date;
  minAgeMs?: number;
  batchSize?: number;
}

export interface ReconcileSummary {
  scanned: number;
  settled: number;
  refundRequired: number;
  cancelled: number;
  skipped: number;
  failed: number;
}

export type ReconcileAction = "paid" | "refund_required" | "cancelled" | "skipped";

interface PendingOrderRow {
  id: string;
  stripePaymentIntentId: string | null;
}

/**
 * Settles one order from an already-retrieved PaymentIntent.
 *
 * The network call happens *before* the transaction: holding a database
 * connection while waiting on Stripe would tie up the pool for the duration of
 * a third-party timeout. The compare-and-set inside the transaction is what
 * makes a concurrent webhook and a concurrent job run safe — whichever gets
 * there first applies, the other observes a non-PENDING row and skips.
 */
async function settleFromSnapshot(
  orderId: string,
  snapshot: PaymentIntentSnapshot,
): Promise<ReconcileAction> {
  if (snapshot.status !== "succeeded" && snapshot.status !== "canceled") {
    // Still in flight, or waiting on the customer. The 30-minute reservation
    // window and the sweeper own this state; reconciliation does not guess.
    return "skipped";
  }

  return db
    .$transaction(
      async (tx) => {
        const order = await tx.order.findUnique({
          where: { id: orderId },
          select: {
            id: true,
            status: true,
            subtotalCents: true,
            discountCents: true,
            totalCents: true,
            currency: true,
          },
        });

        if (order === null || order.status !== "PENDING") {
          return "skipped" as const;
        }

        let target: OrderStatus;
        if (snapshot.status === "canceled") {
          target = "CANCELLED";
        } else {
          const settled = await settlesFully(tx, order, snapshot);
          if (!settled) {
            console.warn(
              `[reconcile] amount mismatch on order ${order.id}: expected ${order.totalCents} ${order.currency}, Stripe ${snapshot.amount_received} ${snapshot.currency} -> REFUND_REQUIRED`,
            );
          }
          target = settled ? "PAID" : "REFUND_REQUIRED";
        }

        if (!isTransitionAllowed(order.status, target)) {
          console.warn(
            `[reconcile] illegal transition ${order.status} -> ${target} for order ${order.id}`,
          );
          return "skipped" as const;
        }

        const applied = await applyTransition(tx, order.id, order.status, target);
        if (!applied) {
          console.warn(
            `[reconcile] lost race applying ${target} to order ${order.id}`,
          );
          return "skipped" as const;
        }

        if (releasesStock(target)) {
          await releaseReservations(tx, order.id);
        }

        if (target === "PAID") return "paid" as const;
        if (target === "REFUND_REQUIRED") return "refund_required" as const;
        return "cancelled" as const;
      },
      { maxWait: 20_000, timeout: 20_000 },
    )
    .catch((error: unknown) => {
      console.error(`[reconcile] failed to settle order ${orderId}`, error);
      return "skipped" as const;
    });
}

/**
 * Finds PENDING orders older than the cut-off whose webhook never arrived,
 * retrieves their PaymentIntent, and settles or cancels them.
 *
 * Idempotent by construction: the order must still be PENDING to be touched,
 * and the transition itself is a compare-and-set. A second run scans nothing
 * for orders the first run settled, so no stock is released twice and no rows
 * are duplicated.
 */
export async function reconcilePendingOrders(
  reader: PaymentIntentReader,
  options: ReconcileOptions = {},
): Promise<ReconcileSummary> {
  const now = options.now ?? new Date();
  const minAgeMs = options.minAgeMs ?? RECONCILE_MIN_AGE_MS;
  const batchSize = options.batchSize ?? RECONCILE_BATCH_SIZE;
  const cutoff = new Date(now.getTime() - minAgeMs);

  const pending: PendingOrderRow[] = await db.order.findMany({
    where: {
      status: "PENDING",
      createdAt: { lt: cutoff },
      stripePaymentIntentId: { not: null },
    },
    select: { id: true, stripePaymentIntentId: true },
    orderBy: { createdAt: "asc" },
    take: batchSize,
  });

  const summary: ReconcileSummary = {
    scanned: pending.length,
    settled: 0,
    refundRequired: 0,
    cancelled: 0,
    skipped: 0,
    failed: 0,
  };

  for (const order of pending) {
    const intentId = order.stripePaymentIntentId;
    if (intentId === null) {
      summary.skipped += 1;
      continue;
    }

    let snapshot: PaymentIntentSnapshot;
    try {
      snapshot = await reader.retrievePaymentIntent(intentId);
    } catch (error: unknown) {
      summary.failed += 1;
      console.error(
        `[reconcile] could not retrieve PaymentIntent ${intentId} for order ${order.id}`,
        error,
      );
      continue;
    }

    if (snapshot.id !== intentId) {
      summary.failed += 1;
      console.error(
        `[reconcile] PaymentIntent mismatch for order ${order.id}: asked ${intentId}, got ${snapshot.id}`,
      );
      continue;
    }

    const action = await settleFromSnapshot(order.id, snapshot);
    if (action === "paid") summary.settled += 1;
    else if (action === "refund_required") summary.refundRequired += 1;
    else if (action === "cancelled") summary.cancelled += 1;
    else summary.skipped += 1;
  }

  return summary;
}

/**
 * Moves a paid order that cannot be fulfilled to REFUND_REQUIRED.
 *
 * Stock is returned here, not when the refund completes: the units are no
 * longer part of a sale the moment fulfilment is abandoned. The order stays in
 * REFUND_REQUIRED until `refundOrder` has a successful refund response.
 */
export async function markRefundRequired(
  orderId: string,
  reason: string,
): Promise<boolean> {
  const applied = await db.$transaction(
    async (tx) => {
      const order = await tx.order.findUnique({
        where: { id: orderId },
        select: { id: true, status: true },
      });
      if (order === null) {
        console.warn(`[refund] order ${orderId} not found`);
        return false;
      }
      if (!isTransitionAllowed(order.status, "REFUND_REQUIRED")) {
        console.warn(
          `[refund] illegal transition ${order.status} -> REFUND_REQUIRED for order ${order.id}: ${reason}`,
        );
        return false;
      }

      const moved = await applyTransition(
        tx,
        order.id,
        order.status,
        "REFUND_REQUIRED",
      );
      if (!moved) {
        console.warn(
          `[refund] lost race setting REFUND_REQUIRED on order ${order.id}`,
        );
        return false;
      }
      await releaseReservations(tx, order.id);
      console.info(`[refund] order ${order.id} -> REFUND_REQUIRED: ${reason}`);
      return true;
    },
    { maxWait: 20_000, timeout: 20_000 },
  );

  return applied;
}

/** The Stripe surface the refund path needs; injected for the same reason. */
export interface RefundGateway {
  refund(
    paymentIntentId: string,
    idempotencyKey: string,
  ): Promise<{ id: string; status: string }>;
}

export type RefundOutcome =
  | "refunded"
  | "already_refunded"
  | "not_refund_required"
  | "missing_payment_intent"
  | "failed";

/**
 * Refunds an order that is in REFUND_REQUIRED.
 *
 * Ordering matters: the Stripe call happens first, and only a successful
 * response is followed by REFUND_REQUIRED -> REFUNDED. If Stripe fails, the
 * order stays REFUND_REQUIRED and a later run can retry. The idempotency key
 * is derived from the order id, so a retry after an ambiguous network failure
 * cannot produce a second refund.
 *
 * When the conditional update finds 0 rows a concurrent refund already won;
 * the outcome is `already_refunded` and the status is left alone.
 */
export async function refundOrder(
  orderId: string,
  gateway: RefundGateway,
): Promise<RefundOutcome> {
  const order = await db.order.findUnique({
    where: { id: orderId },
    select: { id: true, status: true, stripePaymentIntentId: true },
  });
  if (order === null) {
    console.warn(`[refund] order ${orderId} not found`);
    return "not_refund_required";
  }
  if (order.status === "REFUNDED") {
    return "already_refunded";
  }
  if (order.status !== "REFUND_REQUIRED") {
    console.warn(
      `[refund] refusing to refund order ${order.id} in status ${order.status}`,
    );
    return "not_refund_required";
  }
  if (order.stripePaymentIntentId === null) {
    console.error(`[refund] order ${order.id} has no PaymentIntent to refund`);
    return "missing_payment_intent";
  }

  try {
    const refund = await gateway.refund(
      order.stripePaymentIntentId,
      `refund_${order.id}`,
    );
    console.info(
      `[refund] Stripe refund ${refund.id} (${refund.status}) for order ${order.id}`,
    );
  } catch (error: unknown) {
    console.error(`[refund] Stripe refund failed for order ${order.id}`, error);
    return "failed";
  }

  const applied = await db.$transaction(
    async (tx) => {
      const moved = await applyTransition(
        tx,
        order.id,
        "REFUND_REQUIRED",
        "REFUNDED",
      );
      if (!moved) {
        console.warn(
          `[refund] lost race applying REFUNDED to order ${order.id}; refund already recorded`,
        );
        return false;
      }
      await releaseReservations(tx, order.id);
      return true;
    },
    { maxWait: 20_000, timeout: 20_000 },
  );

  return applied ? "refunded" : "already_refunded";
}

export interface AdminOrderItemView {
  id: string;
  sku: string;
  nameSnapshot: string;
  unitPriceCents: number;
  quantity: number;
  variantArchivedAt: Date | null;
}

export interface AdminOrderView {
  id: string;
  status: OrderStatus;
  totalCents: number;
  currency: string;
  createdAt: Date;
  paymentIntentId: string | null;
  userEmail: string | null;
  items: AdminOrderItemView[];
  nextStatuses: readonly OrderStatus[];
}

/**
 * Read-only projection for `/admin/orders`.
 *
 * `OrderItem` rows are never filtered by `Variant.archivedAt`: history is the
 * snapshot, and archiving a product must not make a past order look empty. The
 * variant relation is read only to annotate that the product is archived.
 */
export async function listOrdersForAdmin(
  limit = 100,
): Promise<AdminOrderView[]> {
  const orders = await db.order.findMany({
    orderBy: { createdAt: "desc" },
    take: limit,
    select: {
      id: true,
      status: true,
      totalCents: true,
      currency: true,
      createdAt: true,
      stripePaymentIntentId: true,
      user: { select: { email: true } },
      items: {
        orderBy: { sku: "asc" },
        select: {
          id: true,
          sku: true,
          nameSnapshot: true,
          unitPriceCents: true,
          quantity: true,
          variant: { select: { archivedAt: true } },
        },
      },
    },
  });

  return orders.map((order) => ({
    id: order.id,
    status: order.status,
    totalCents: order.totalCents,
    currency: order.currency,
    createdAt: order.createdAt,
    paymentIntentId: order.stripePaymentIntentId,
    userEmail: order.user.email,
    items: order.items.map((item) => ({
      id: item.id,
      sku: item.sku,
      nameSnapshot: item.nameSnapshot,
      unitPriceCents: item.unitPriceCents,
      quantity: item.quantity,
      variantArchivedAt: item.variant?.archivedAt ?? null,
    })),
    nextStatuses: allowedNextStatuses(order.status),
  }));
}
