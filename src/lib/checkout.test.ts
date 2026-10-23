import { describe, expect, it } from "vitest";

import { cartVersion, computeTotals, parseCheckoutBody } from "./checkout";

describe("cartVersion", () => {
  it("matches the documented canonical hash for a single line", () => {
    expect(cartVersion([{ variantId: "c98aedfb-dcf9-41ab-b860-12f028f95098", quantity: 1 }])).toBe(
      "8c9ef35eaa01964b31d4d290ffd6577068e22eef79c276d92b7ffbc8a02bcee0",
    );
  });

  it("is independent of the order lines arrive in", () => {
    const first = cartVersion([
      { variantId: "00000000-0000-4000-8000-00000000000b", quantity: 2 },
      { variantId: "00000000-0000-4000-8000-00000000000a", quantity: 1 },
    ]);
    const second = cartVersion([
      { variantId: "00000000-0000-4000-8000-00000000000a", quantity: 1 },
      { variantId: "00000000-0000-4000-8000-00000000000b", quantity: 2 },
    ]);

    expect(first).toBe(second);
  });

  it("changes when a quantity changes", () => {
    const one = cartVersion([
      { variantId: "00000000-0000-4000-8000-00000000000a", quantity: 1 },
    ]);
    const two = cartVersion([
      { variantId: "00000000-0000-4000-8000-00000000000a", quantity: 2 },
    ]);

    expect(one).not.toBe(two);
  });
});

describe("computeTotals", () => {
  it("adds the standard shipping rate below the threshold", () => {
    const totals = computeTotals(
      [{ variantId: "a", quantity: 1, priceCents: 4_900 }],
      "STANDARD",
    );

    expect(totals).toEqual({
      subtotalCents: 4_900,
      shippingCents: 490,
      totalCents: 5_390,
    });
  });

  it("multiplies integer cents and never introduces fractions", () => {
    const totals = computeTotals(
      [
        { variantId: "a", quantity: 3, priceCents: 1_999 },
        { variantId: "b", quantity: 2, priceCents: 4_900 },
      ],
      "STANDARD",
    );

    expect(totals.subtotalCents).toBe(15_797);
    expect(totals.shippingCents).toBe(0);
    expect(totals.totalCents).toBe(15_797);
    expect(Number.isInteger(totals.totalCents)).toBe(true);
  });
});

describe("parseCheckoutBody", () => {
  it("takes only addressId and cartVersion", () => {
    const parsed = parseCheckoutBody({
      addressId: "00000000-0000-4000-8000-000000000001",
      cartVersion: "abc",
      totalCents: 1,
      shippingCents: 0,
      email: "attacker@example.test",
    });

    expect(parsed).toEqual({
      ok: true,
      addressId: "00000000-0000-4000-8000-000000000001",
      cartVersion: "abc",
    });
  });

  it("rejects a missing or non-string addressId", () => {
    expect(parseCheckoutBody({ cartVersion: "abc" }).ok).toBe(false);
    expect(parseCheckoutBody({ addressId: 42, cartVersion: "abc" }).ok).toBe(false);
  });

  it("rejects a missing or empty cartVersion", () => {
    expect(parseCheckoutBody({ addressId: "a" }).ok).toBe(false);
    expect(parseCheckoutBody({ addressId: "a", cartVersion: "" }).ok).toBe(false);
  });

  it("rejects a body that is not an object", () => {
    expect(parseCheckoutBody(null).ok).toBe(false);
    expect(parseCheckoutBody("nope").ok).toBe(false);
    expect(parseCheckoutBody([]).ok).toBe(false);
  });
});
