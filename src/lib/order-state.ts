import type { OrderStatus } from "@prisma/client";

// The order state machine, in one table.
//
// Webhooks arrive out of order and more than once, so the machine is defined
// positively: a transition is applied only when it is listed here, and every
// application is an `UPDATE ... WHERE id = $1 AND status = $2`. A zero-row
// update is a lost race or an illegal move — both are logged and answered 200,
// because Stripe retries non-2xx for three days and retrying cannot help.
//
// `CANCELLED -> PAID` is deliberately legal: money that arrives after the
// sweeper cancelled an abandoned checkout is still real money.

const ALLOWED: Readonly<Record<OrderStatus, readonly OrderStatus[]>> = {
  PENDING: ["PAID", "PAYMENT_FAILED", "CANCELLED", "REFUND_REQUIRED", "REFUNDED"],
  PAYMENT_FAILED: ["PAID", "REFUND_REQUIRED", "REFUNDED"],
  PAID: ["FULFILLED", "REFUND_REQUIRED", "REFUNDED"],
  FULFILLED: ["REFUNDED"],
  CANCELLED: ["PAID", "REFUND_REQUIRED", "REFUNDED"],
  REFUND_REQUIRED: ["REFUNDED"],
  REFUNDED: [],
};

export function isTransitionAllowed(
  from: OrderStatus,
  to: OrderStatus,
): boolean {
  return ALLOWED[from].includes(to);
}

export function allowedNextStatuses(
  from: OrderStatus,
): readonly OrderStatus[] {
  return ALLOWED[from];
}

/**
 * Whether entering `status` hands reserved stock back to the shelf.
 *
 * A payment that failed or was cancelled, and an order that needs refunding,
 * no longer has a claim on the units. `PAID` keeps the reservation: the units
 * are sold, and the reservation row is the audit trail for that sale.
 */
export function releasesStock(status: OrderStatus): boolean {
  return (
    status === "CANCELLED" ||
    status === "PAYMENT_FAILED" ||
    status === "REFUND_REQUIRED" ||
    status === "REFUNDED"
  );
}
