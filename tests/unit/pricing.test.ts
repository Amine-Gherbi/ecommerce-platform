import { describe, expect, it } from "vitest";

import {
  chargeableQuantity,
  computeTotals,
  type PricingLine,
} from "@/lib/pricing";

function line(
  unitPriceCents: number,
  quantity: number,
  availableStock = 1_000,
): PricingLine {
  return { unitPriceCents, quantity, availableStock };
}

describe("computeTotals", () => {
  it("returns zeroes for an empty cart", () => {
    expect(computeTotals([])).toEqual({
      subtotalCents: 0,
      discountCents: 0,
      totalCents: 0,
    });
  });

  it("sums integer cents across lines", () => {
    const totals = computeTotals([line(1_999, 2), line(250, 4)]);
    expect(totals).toEqual({
      subtotalCents: 4_998,
      discountCents: 0,
      totalCents: 4_998,
    });
  });

  it("drops lines whose quantity is zero", () => {
    const totals = computeTotals([line(1_000, 0), line(500, 3)]);
    expect(totals.subtotalCents).toBe(1_500);
  });

  it("rounds the coupon discount half-up, once, in cents", () => {
    // 3 x 333 = 999 cents; 15% is 149.85 -> 150.
    const totals = computeTotals([line(333, 3)], { percentOff: 15 });
    expect(totals).toEqual({
      subtotalCents: 999,
      discountCents: 150,
      totalCents: 849,
    });
  });

  it("rounds .5 cents up rather than toward zero", () => {
    expect(computeTotals([line(1, 1)], { percentOff: 50 }).discountCents).toBe(1);
  });

  it("yields exactly zero at a 100% coupon, never negative", () => {
    const totals = computeTotals([line(12_345, 2)], { percentOff: 100 });
    expect(totals).toEqual({
      subtotalCents: 24_690,
      discountCents: 24_690,
      totalCents: 0,
    });
  });

  it("clamps coupons above 100% and below 0%", () => {
    const above = computeTotals([line(1_000, 1)], { percentOff: 250 });
    expect(above.totalCents).toBe(0);

    const below = computeTotals([line(1_000, 1)], { percentOff: -20 });
    expect(below.discountCents).toBe(0);
    expect(below.totalCents).toBe(1_000);
  });

  it("floors fractional coupon percentages instead of trusting them", () => {
    expect(
      computeTotals([line(1_000, 1)], { percentOff: 12.9 }).discountCents,
    ).toBe(120);
  });

  it("caps a quantity above stock at available stock", () => {
    const totals = computeTotals([line(2_000, 5, 2)]);
    expect(totals.subtotalCents).toBe(4_000);
  });

  it("charges nothing when stock is zero", () => {
    expect(computeTotals([line(2_000, 5, 0)]).subtotalCents).toBe(0);
  });

  it("treats a non-finite stock as unavailable", () => {
    expect(
      computeTotals([line(2_000, 5, Number.POSITIVE_INFINITY)]).subtotalCents,
    ).toBe(0);
  });

  it("keeps a 100% coupon at zero even when every line is stock-capped", () => {
    const totals = computeTotals([line(9_999, 10, 1)], { percentOff: 100 });
    expect(totals.totalCents).toBe(0);
  });

  it("rejects non-integer or negative unit prices", () => {
    expect(() => computeTotals([line(10.5, 1)])).toThrow(RangeError);
    expect(() => computeTotals([line(-1, 1)])).toThrow(RangeError);
    expect(() => computeTotals([line(Number.NaN, 1)])).toThrow(RangeError);
  });

  it("rejects fractional quantities", () => {
    expect(() => computeTotals([line(100, 1.5)])).toThrow(RangeError);
  });
});

describe("chargeableQuantity", () => {
  it("returns zero for zero quantity without consulting stock", () => {
    expect(chargeableQuantity(line(100, 0, 0))).toBe(0);
  });

  it("returns the smaller of quantity and stock", () => {
    expect(chargeableQuantity(line(100, 3, 10))).toBe(3);
    expect(chargeableQuantity(line(100, 10, 3))).toBe(3);
  });

  it("treats negative stock as zero", () => {
    expect(chargeableQuantity(line(100, 2, -4))).toBe(0);
  });
});
