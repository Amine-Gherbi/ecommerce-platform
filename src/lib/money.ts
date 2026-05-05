// Display-only money helpers. Totals are always integer cents; division by 100
// happens once, inside Intl, and never feeds another calculation.

const EUR = new Intl.NumberFormat("en-IE", {
  style: "currency",
  currency: "EUR",
});

export const FREE_SHIPPING_THRESHOLD_CENTS = 10_000;
export const SHIPPING_CENTS = 900;
export const MAX_CART_QUANTITY = 10;

export function formatPrice(cents: number): string {
  return EUR.format(cents / 100);
}

export function shippingRuleCopy(): string {
  return `Free shipping over ${formatPrice(
    FREE_SHIPPING_THRESHOLD_CENTS,
  )}; otherwise ${formatPrice(SHIPPING_CENTS)}.`;
}
