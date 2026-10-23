import { describe, expect, it } from "vitest";

import { formatPrice, shippingForSubtotal } from "./money";

describe("formatPrice", () => {
  it("renders every amount in euro cents", () => {
    expect(formatPrice(1_900)).toBe("€19.00");
    expect(formatPrice(4_900)).toBe("€49.00");
    expect(formatPrice(0)).toBe("€0.00");
  });
});

describe("shippingForSubtotal", () => {
  it("charges nothing for an empty cart", () => {
    expect(shippingForSubtotal(0, "STANDARD")).toBe(0);
  });

  it("charges standard shipping below the free threshold", () => {
    expect(shippingForSubtotal(7_999, "STANDARD")).toBe(490);
  });

  it("makes standard shipping free at and above the threshold", () => {
    expect(shippingForSubtotal(8_000, "STANDARD")).toBe(0);
    expect(shippingForSubtotal(20_000, "STANDARD")).toBe(0);
  });

  it("charges one express rate regardless of subtotal", () => {
    expect(shippingForSubtotal(1_000, "EXPRESS")).toBe(950);
    expect(shippingForSubtotal(20_000, "EXPRESS")).toBe(950);
  });
});
