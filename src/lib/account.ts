import type { OrderStatus, Prisma } from "@prisma/client";

export interface OrderAddress {
  label: string;
  line1: string;
  line2: string | null;
  city: string;
  postalCode: string;
  country: string;
}

export interface OrderTimelineEvent {
  label: string;
  at: Date | null;
}

const STATUS_LABELS: Record<OrderStatus, string> = {
  PENDING: "Pending payment",
  PAID: "Paid",
  FULFILLED: "Fulfilled",
  CANCELLED: "Cancelled",
  REFUND_REQUIRED: "Refund required",
  REFUNDED: "Refunded",
};

export function orderStatusLabel(status: OrderStatus): string {
  return STATUS_LABELS[status];
}

export function formatOrderDate(date: Date): string {
  return new Intl.DateTimeFormat("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  }).format(date);
}

export function firstName(name: string | null | undefined): string {
  const trimmed = name?.trim() ?? "";
  const [first] = trimmed.split(/\s+/);
  return first !== undefined && first.length > 0 ? first : "Account";
}

function stringField(source: Record<string, unknown>, key: string): string | null {
  const value = source[key];
  return typeof value === "string" && value.length > 0 ? value : null;
}

export function parseOrderAddress(value: Prisma.JsonValue): OrderAddress | null {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return null;
  }

  const record = value as Record<string, unknown>;
  const label = stringField(record, "label");
  const line1 = stringField(record, "line1");
  const city = stringField(record, "city");
  const postalCode = stringField(record, "postalCode");
  const country = stringField(record, "country");

  if (
    label === null ||
    line1 === null ||
    city === null ||
    postalCode === null ||
    country === null
  ) {
    return null;
  }

  return {
    label,
    line1,
    line2: stringField(record, "line2"),
    city,
    postalCode,
    country,
  };
}

// The schema stores the current status plus payment timestamps, not an event
// log. Build an honest timeline from what is recorded: placed, paid, and the
// terminal state when the order has reached one.
export function orderTimeline(order: {
  status: OrderStatus;
  createdAt: Date;
  paidAt: Date | null;
}): OrderTimelineEvent[] {
  const events: OrderTimelineEvent[] = [
    { label: "Order placed", at: order.createdAt },
  ];

  if (order.paidAt !== null) {
    events.push({ label: "Payment received", at: order.paidAt });
  }

  const terminal: Partial<Record<OrderStatus, string>> = {
    FULFILLED: "Fulfilled",
    CANCELLED: "Cancelled",
    REFUND_REQUIRED: "Refund required",
    REFUNDED: "Refunded",
  };
  const terminalLabel = terminal[order.status];
  if (terminalLabel !== undefined) {
    events.push({ label: terminalLabel, at: null });
  }

  return events;
}
