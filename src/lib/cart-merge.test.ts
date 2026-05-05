import { describe, expect, it } from "vitest";

import { mergeCartQuantity } from "./cart-merge";

describe("mergeCartQuantity", () => {
  it("takes the anonymous quantity when the account has no such line", () => {
    expect(mergeCartQuantity(null, 2)).toBe(2);
  });

  it("keeps the higher quantity when both carts have the same variant", () => {
    expect(mergeCartQuantity(3, 2)).toBe(3);
    expect(mergeCartQuantity(1, 4)).toBe(4);
  });

  it("is stable when the same merge is replayed", () => {
    expect(mergeCartQuantity(4, 4)).toBe(4);
  });
});
