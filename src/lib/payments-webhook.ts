// Stripe's `payment_intent.succeeded` event is the only thing allowed to move
// an order from PENDING to PAID, and the event row is inserted in the same
// transaction as the state change so a replay is a no-op.

import type { Prisma } from "@prisma/client";
import type Stripe from "stripe";

import { db } from "@/lib/db";
import { releaseReservationsForOrder } from "@/lib/reservations";

export type WebhookAction =
  | "duplicate"
  | "ignored"
  | "paid"
  | "refund_required"
  | "illegal_transition";

export interface PaymentsEvent {
  id: string;
  type: string;
  data: {
    paymentIntentId?: unknown;
    amountCents?: unknown;
    currency?: unknown;
  };
}

export interface WebhookResult {
  action: WebhookAction;
}

const SUPPORTED_TYPE = "payment_intent.succeeded";

// `constructEvent` has already verified the signature and parsed the snapshot;
// this only lifts the PaymentIntent fields the state machine compares.
export function parsePaymentsEvent(event: Stripe.Event): PaymentsEvent | null {
  if (typeof event.id !== "string" || event.id.length === 0) {
    return null;
  }
  if (typeof event.type !== "string" || event.type.length === 0) {
    return null;
  }

  const object: unknown = event.data?.object;
  if (typeof object !== "object" || object === null) {
    return { id: event.id, type: event.type, data: {} };
  }

  const record = object as Record<string, unknown>;
  return {
    id: event.id,
    type: event.type,
    data: {
      paymentIntentId: record.id,
      amountCents: record.amount,
      currency: record.currency,
    },
  };
}

function hasPrismaCode(error: unknown, code: string): boolean {
  if (typeof error !== "object" || error === null) {
    return false;
  }
  const candidate = error as { code?: unknown };
  return candidate.code === code;
}

async function markProcessed(
  tx: Prisma.TransactionClient,
  eventId: string,
): Promise<void> {
  await tx.webhookEvent.update({
    where: { eventId },
    data: { processedAt: new Date() },
  });
}

export async function processPaymentsEvent(
  event: PaymentsEvent,
): Promise<WebhookResult> {
  try {
    return await db.$transaction(async (tx): Promise<WebhookResult> => {
      // The unique eventId is the replay arbiter. Insert first so a redelivery
      // rolls back before any side effect.
      await tx.webhookEvent.create({
        data: {
          provider: "payments",
          eventId: event.id,
          type: event.type,
          payload: JSON.parse(JSON.stringify(event)) as Prisma.InputJsonValue,
        },
      });

      if (event.type !== SUPPORTED_TYPE) {
        await markProcessed(tx, event.id);
        console.warn(
          `[payments-webhook] ignored event=${event.id} type=${event.type}`,
        );
        return { action: "ignored" };
      }

      const paymentIntentId =
        typeof event.data.paymentIntentId === "string"
          ? event.data.paymentIntentId
          : null;

      if (paymentIntentId === null) {
        await markProcessed(tx, event.id);
        console.warn(
          `[payments-webhook] ignored event=${event.id} reason=missing-payment-intent`,
        );
        return { action: "ignored" };
      }

      const order = await tx.order.findUnique({
        where: { paymentIntentId },
        select: {
          id: true,
          status: true,
          totalCents: true,
          currency: true,
        },
      });

      if (order === null) {
        // It may belong to another environment; record it and move on.
        await markProcessed(tx, event.id);
        console.warn(
          `[payments-webhook] ignored event=${event.id} paymentIntent=${paymentIntentId}`,
        );
        return { action: "ignored" };
      }

      if (order.status !== "PENDING") {
        await markProcessed(tx, event.id);
        console.warn(
          `[payments-webhook] illegal transition event=${event.id} order=${order.id} status=${order.status}`,
        );
        return { action: "illegal_transition" };
      }

      const amountMatches =
        typeof event.data.amountCents === "number" &&
        Number.isInteger(event.data.amountCents) &&
        event.data.amountCents === order.totalCents;
      const currencyMatches =
        typeof event.data.currency === "string" &&
        event.data.currency.toLowerCase() === order.currency.toLowerCase();

      if (!amountMatches || !currencyMatches) {
        const moved = await tx.$executeRaw`
          UPDATE "Order"
          SET status = 'REFUND_REQUIRED'
          WHERE id = ${order.id}::uuid AND status = 'PENDING'
        `;

        if (moved === 1) {
          // The money is wrong; the units are not sold.
          await releaseReservationsForOrder(tx, order.id);
        }

        await markProcessed(tx, event.id);
        console.warn(
          `[payments-webhook] amount mismatch event=${event.id} order=${order.id} expected=${order.totalCents} received=${String(event.data.amountCents)} currency=${String(event.data.currency)}`,
        );
        return { action: "refund_required" };
      }

      const moved = await tx.$executeRaw`
        UPDATE "Order"
        SET status = 'PAID', "paidAt" = now()
        WHERE id = ${order.id}::uuid AND status = 'PENDING'
      `;

      await markProcessed(tx, event.id);

      if (moved !== 1) {
        console.warn(
          `[payments-webhook] illegal transition event=${event.id} order=${order.id}`,
        );
        return { action: "illegal_transition" };
      }

      return { action: "paid" };
    });
  } catch (error: unknown) {
    if (hasPrismaCode(error, "P2002")) {
      console.warn(`[payments-webhook] duplicate event=${event.id}`);
      return { action: "duplicate" };
    }
    throw error;
  }
}
