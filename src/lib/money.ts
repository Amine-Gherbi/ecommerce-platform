// Money formatting and the authoritative shipping rule. Amounts are always
// integer cents; division by 100 happens once, inside Intl, and never feeds
// another calculation.

import type { DeliveryMethod } from "@prisma/client";

const EUR = new Intl.NumberFormat("en-IE", {
  style: "currency",
  currency: "EUR",
});

// The shipping rule is a server rule, never a client-supplied number, and the
// rates below are the only place any of these amounts are written down.
export const FREE_SHIPPING_THRESHOLD_CENTS = 8_000;
export const SHIPPING_CENTS = 490;
export const EXPRESS_SHIPPING_CENTS = 950;
export const MAX_CART_QUANTITY = 10;

export function formatPrice(cents: number): string {
  return EUR.format(cents / 100);
}

export function shippingForSubtotal(
  subtotalCents: number,
  deliveryMethod: DeliveryMethod,
): number {
  if (subtotalCents === 0) {
    return 0;
  }

  if (deliveryMethod === "EXPRESS") {
    return EXPRESS_SHIPPING_CENTS;
  }

  return subtotalCents >= FREE_SHIPPING_THRESHOLD_CENTS
    ? 0
    : SHIPPING_CENTS;
}

export function shippingRuleCopy(): string {
  return `Free standard shipping at or above ${formatPrice(
    FREE_SHIPPING_THRESHOLD_CENTS,
  )}; otherwise ${formatPrice(SHIPPING_CENTS)}. Express ${formatPrice(
    EXPRESS_SHIPPING_CENTS,
  )}.`;
}
