// Display-only money helpers. Totals are always integer cents; division by 100
// happens once, inside Intl, and never feeds another calculation.

const USD = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
});

// Shipping is a server rule, never a client-supplied number.
export const FREE_SHIPPING_THRESHOLD_CENTS = 8_000;
export const SHIPPING_CENTS = 490;
export const EXPRESS_SHIPPING_CENTS = 990;
export const MAX_CART_QUANTITY = 10;

export function formatPrice(cents: number): string {
  return USD.format(cents / 100);
}

export function shippingRuleCopy(): string {
  return `Free standard shipping over ${formatPrice(
    FREE_SHIPPING_THRESHOLD_CENTS,
  )}; otherwise ${formatPrice(SHIPPING_CENTS)}. Express ${formatPrice(
    EXPRESS_SHIPPING_CENTS,
  )}.`;
}
