import type { OrderStatus } from "@prisma/client";

import { orderStatusLabel } from "@/lib/account";
import { recordAudit } from "@/lib/audit";
import { db } from "@/lib/db";
import { isUuid } from "@/lib/ids";
import { releaseReservationsForOrder } from "@/lib/reservations";

// R4 defined the six statuses and the events that reach them. The admin console
// gets exactly three moves and nothing else; inventing a transition here would
// create a state the payment webhook and the sweeper do not understand.
const ADMIN_TRANSITIONS: Partial<Record<OrderStatus, readonly OrderStatus[]>> = {
  PENDING: ["CANCELLED"],
  PAID: ["FULFILLED"],
  REFUND_REQUIRED: ["REFUNDED"],
};

export const ORDER_STATUSES: readonly OrderStatus[] = [
  "PENDING",
  "PAID",
  "FULFILLED",
  "CANCELLED",
  "REFUND_REQUIRED",
  "REFUNDED",
];

export function isOrderStatus(value: string): value is OrderStatus {
  return (ORDER_STATUSES as readonly string[]).includes(value);
}

export function adminTargetsFor(status: OrderStatus): readonly OrderStatus[] {
  return ADMIN_TRANSITIONS[status] ?? [];
}

export function canAdminTransition(
  from: OrderStatus,
  to: OrderStatus,
): boolean {
  return adminTargetsFor(from).includes(to);
}

export type AdminTransitionResult =
  | { ok: true; number: string; status: OrderStatus }
  | { ok: false; reason: "not_found"; message: string }
  | { ok: false; reason: "illegal"; number: string; message: string }
  | { ok: false; reason: "invalid_target"; message: string };

export interface AdminTransitionInput {
  orderId: string;
  target: string;
  actorId: string;
}

export async function transitionOrder({
  orderId,
  target,
  actorId,
}: AdminTransitionInput): Promise<AdminTransitionResult> {
  if (!isUuid(orderId)) {
    return { ok: false, reason: "not_found", message: "Order not found." };
  }
  if (!isOrderStatus(target)) {
    return {
      ok: false,
      reason: "invalid_target",
      message: "Unknown order status.",
    };
  }

  return db.$transaction(
    async (tx): Promise<AdminTransitionResult> => {
      const order = await tx.order.findUnique({
        where: { id: orderId },
        select: { id: true, number: true, status: true },
      });

      if (order === null) {
        return { ok: false, reason: "not_found", message: "Order not found." };
      }

      if (!canAdminTransition(order.status, target)) {
        return {
          ok: false,
          reason: "illegal",
          number: order.number,
          message: `Order ${order.number} is ${orderStatusLabel(
            order.status,
          )}; it cannot move to ${orderStatusLabel(target)}.`,
        };
      }

      // The status predicate is the compare-and-set. A concurrent webhook or
      // sweeper that moves the order first wins, and this action reports that
      // rather than overwriting the newer state.
      const moved = await tx.order.updateMany({
        where: { id: order.id, status: order.status },
        data: { status: target },
      });

      if (moved.count !== 1) {
        return {
          ok: false,
          reason: "illegal",
          number: order.number,
          message: `Order ${order.number} changed while the action ran. Reload and try again.`,
        };
      }

      // Cancelling a pending order gives its units back. Paid orders keep
      // their decremented stock; fulfilment does not touch reservations.
      if (order.status === "PENDING") {
        await releaseReservationsForOrder(tx, order.id);
      }

      await recordAudit(tx, {
        actorId,
        action: "order.status_changed",
        entity: "Order",
        entityId: order.id,
        detail: {
          number: order.number,
          from: order.status,
          to: target,
        },
      });

      return { ok: true, number: order.number, status: target };
    },
  );
}
