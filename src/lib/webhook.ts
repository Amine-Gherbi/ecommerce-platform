import type { OrderStatus, Prisma } from "@prisma/client";
import type Stripe from "stripe";

import { db } from "@/lib/db";
import { isTransitionAllowed, releasesStock } from "@/lib/order-state";

// Stripe event processing.
//
// Two rules shape the whole module:
//   1. The event row and the state change commit together. A duplicate event
//      hits the `WebhookEvent.stripeEventId` primary key and rolls back before
//      any side effect; the route turns that into a 200.
//   2. An illegal or late transition is not an error. The event is recorded,
//      the transition is skipped, and the route still answers 200 — Stripe
//      retries non-2xx for three days, and retrying a lost race cannot help.

type Tx = Prisma.TransactionClient;

export interface WebhookOutcome {
  action: "processed" | "ignored" | "illegal";
  orderId?: string;
  from?: OrderStatus;
  to?: OrderStatus;
}

interface EventPlan {
  paymentIntentId: string;
  target: OrderStatus;
  /** Present for `payment_intent.*` events; used to verify the amount. */
  paymentIntent?: Stripe.PaymentIntent;
}

function planFor(event: Stripe.Event): EventPlan | null {
  switch (event.type) {
    case "payment_intent.succeeded": {
      const intent = event.data.object as Stripe.PaymentIntent;
      return {
        paymentIntentId: intent.id,
        target: "PAID",
        paymentIntent: intent,
      };
    }
    case "payment_intent.payment_failed": {
      const intent = event.data.object as Stripe.PaymentIntent;
      return { paymentIntentId: intent.id, target: "PAYMENT_FAILED" };
    }
    case "payment_intent.canceled": {
      const intent = event.data.object as Stripe.PaymentIntent;
      return { paymentIntentId: intent.id, target: "CANCELLED" };
    }
    case "charge.refunded": {
      const charge = event.data.object as Stripe.Charge;
      const intent = charge.payment_intent;
      const id =
        typeof intent === "string" ? intent : intent?.id ?? null;
      if (id === null || id.length === 0) {
        return null;
      }
      return { paymentIntentId: id, target: "REFUNDED" };
    }
    default:
      return null;
  }
}

interface OrderRow {
  id: string;
  status: OrderStatus;
  subtotalCents: number;
  discountCents: number;
  totalCents: number;
  currency: string;
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
async function settlesFully(
  tx: Tx,
  order: OrderRow,
  intent: Stripe.PaymentIntent,
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

/**
 * Returns reserved units to the shelf. The reservation row is kept and stamped
 * `releasedAt`; deleting it would erase the audit trail.
 */
async function releaseReservations(tx: Tx, orderId: string): Promise<void> {
  const reservations = await tx.stockReservation.findMany({
    where: { orderId, releasedAt: null },
    select: { id: true, variantId: true, qty: true },
    orderBy: { variantId: "asc" },
  });
  if (reservations.length === 0) {
    return;
  }

  const releasedAt = new Date();
  for (const reservation of reservations) {
    await tx.variant.update({
      where: { id: reservation.variantId },
      data: { stock: { increment: reservation.qty } },
    });
    await tx.stockReservation.update({
      where: { id: reservation.id },
      data: { releasedAt },
    });
  }
}

export async function processStripeEvent(
  event: Stripe.Event,
): Promise<WebhookOutcome> {
  return db.$transaction(
    async (tx) => {
      // The replay guard and the side effect share a transaction. A duplicate
      // primary key aborts both; nothing was applied twice.
      await tx.webhookEvent.create({
        data: {
          stripeEventId: event.id,
          type: event.type,
          payload: event as unknown as Prisma.InputJsonValue,
        },
      });

      const plan = planFor(event);
      if (plan === null) {
        console.info(`[webhook] ignored ${event.type} (${event.id})`);
        return { action: "ignored" } as const;
      }

      const order = await tx.order.findUnique({
        where: { stripePaymentIntentId: plan.paymentIntentId },
        select: {
          id: true,
          status: true,
          subtotalCents: true,
          discountCents: true,
          totalCents: true,
          currency: true,
        },
      });

      if (order === null) {
        // Order-agnostic: an event may belong to another environment, or to a
        // PaymentIntent the checkout never managed to persist. Record and move
        // on — a 4xx here would make Stripe retry forever.
        console.warn(
          `[webhook] no order for payment intent ${plan.paymentIntentId} (${event.type})`,
        );
        return { action: "ignored" } as const;
      }

      let target = plan.target;
      if (target === "PAID") {
        const intent = plan.paymentIntent;
        const settled =
          intent !== undefined && (await settlesFully(tx, order, intent));
        if (!settled) {
          console.warn(
            `[webhook] amount mismatch on order ${order.id}: expected ${order.totalCents} ${order.currency}, event ${event.id} -> REFUND_REQUIRED`,
          );
          target = "REFUND_REQUIRED";
        }
      }

      if (!isTransitionAllowed(order.status, target)) {
        console.warn(
          `[webhook] illegal transition ${order.status} -> ${target} for order ${order.id} (${event.type}, ${event.id})`,
        );
        return {
          action: "illegal",
          orderId: order.id,
          from: order.status,
          to: target,
        } as const;
      }

      // Compare-and-set: the status read above is the expected value, so a
      // concurrent webhook that moved the order first makes this a no-op.
      const applied = await tx.order.updateMany({
        where: { id: order.id, status: order.status },
        data: { status: target },
      });
      if (applied.count !== 1) {
        console.warn(
          `[webhook] lost race applying ${target} to order ${order.id} (${event.id})`,
        );
        return {
          action: "illegal",
          orderId: order.id,
          from: order.status,
          to: target,
        } as const;
      }

      if (releasesStock(target)) {
        await releaseReservations(tx, order.id);
      }

      return {
        action: "processed",
        orderId: order.id,
        from: order.status,
        to: target,
      } as const;
    },
    { maxWait: 20_000, timeout: 20_000 },
  );
}
