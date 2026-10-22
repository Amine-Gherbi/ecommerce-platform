// The single source of truth for cart and order money.
//
// Everything here is integer cents. There is no float arithmetic on the way to a
// total: quantities are integers, unit prices are integers, and the coupon
// discount is rounded once, in cents, with half-up rounding. A quantity of zero
// contributes nothing, and a quantity above available stock is charged at stock,
// never above it. A 100% coupon yields zero, never a negative total.

export interface PricingLine {
  /** Unit price in integer cents. Never trusted from the client at checkout. */
  unitPriceCents: number;
  /** Requested quantity. `0` (or less) removes the line from the total. */
  quantity: number;
  /** Stock available for this variant at pricing time. */
  availableStock: number;
}

export interface CouponLike {
  /** Whole percent, 0–100. Values outside the range are clamped. */
  percentOff: number;
}

export interface Totals {
  subtotalCents: number;
  discountCents: number;
  totalCents: number;
}

const EMPTY_TOTALS: Totals = Object.freeze({
  subtotalCents: 0,
  discountCents: 0,
  totalCents: 0,
});

function assertUnitPrice(line: PricingLine): void {
  if (!Number.isSafeInteger(line.unitPriceCents) || line.unitPriceCents < 0) {
    throw new RangeError(
      `unitPriceCents must be a non-negative integer, received ${String(line.unitPriceCents)}`,
    );
  }
  if (!Number.isSafeInteger(line.quantity)) {
    throw new RangeError(
      `quantity must be an integer, received ${String(line.quantity)}`,
    );
  }
}

/**
 * Quantity that may actually be charged for a line.
 *
 * - `quantity <= 0` means the line is gone.
 * - a non-positive or unknown stock charges nothing.
 * - otherwise the charge is capped at `availableStock`.
 */
export function chargeableQuantity(line: PricingLine): number {
  assertUnitPrice(line);

  if (line.quantity <= 0) {
    return 0;
  }

  const stock = Number.isFinite(line.availableStock)
    ? Math.max(0, Math.floor(line.availableStock))
    : 0;

  return Math.min(line.quantity, stock);
}

function clampPercent(percentOff: number): number {
  if (!Number.isFinite(percentOff)) {
    return 0;
  }
  return Math.min(100, Math.max(0, Math.floor(percentOff)));
}

/**
 * Computes subtotal, discount and total from cart lines and an optional coupon.
 *
 * Pure: no database, no clock, no environment. Call it with the same inputs and
 * get the same integers. Order code must use this function rather than
 * re-deriving money anywhere else.
 */
export function computeTotals(
  lines: readonly PricingLine[],
  coupon: CouponLike | null = null,
): Totals {
  if (lines.length === 0) {
    return EMPTY_TOTALS;
  }

  let subtotalCents = 0;
  for (const line of lines) {
    subtotalCents += line.unitPriceCents * chargeableQuantity(line);
  }

  const percentOff = coupon === null ? 0 : clampPercent(coupon.percentOff);
  // Integer subtotal * integer percent is an exact integer product. The single
  // division by 100 is rounded half-up so 999 cents at 15% is 150, not 149 or
  // 149.85.
  const rawDiscount = Math.round((subtotalCents * percentOff) / 100);
  const discountCents = Math.min(subtotalCents, Math.max(0, rawDiscount));

  return {
    subtotalCents,
    discountCents,
    totalCents: subtotalCents - discountCents,
  };
}
