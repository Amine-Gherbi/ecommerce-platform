import { describe, expect, it } from "vitest";

import {
  adminTargetsFor,
  canAdminTransition,
  isOrderStatus,
} from "./admin-orders";

describe("admin order state machine", () => {
  it("allows exactly the transitions the admin console exposes", () => {
    expect(canAdminTransition("PAID", "FULFILLED")).toBe(true);
    expect(canAdminTransition("PENDING", "CANCELLED")).toBe(true);
    expect(canAdminTransition("REFUND_REQUIRED", "REFUNDED")).toBe(true);
  });

  it("refuses every other pair, including FULFILLED to PAID", () => {
    expect(canAdminTransition("FULFILLED", "PAID")).toBe(false);
    expect(canAdminTransition("FULFILLED", "CANCELLED")).toBe(false);
    expect(canAdminTransition("FULFILLED", "REFUND_REQUIRED")).toBe(false);
    expect(canAdminTransition("CANCELLED", "PAID")).toBe(false);
    expect(canAdminTransition("CANCELLED", "FULFILLED")).toBe(false);
    expect(canAdminTransition("PAID", "CANCELLED")).toBe(false);
    expect(canAdminTransition("PAID", "REFUNDED")).toBe(false);
    expect(canAdminTransition("PENDING", "PAID")).toBe(false);
    expect(canAdminTransition("PENDING", "FULFILLED")).toBe(false);
    expect(canAdminTransition("REFUND_REQUIRED", "PAID")).toBe(false);
    expect(canAdminTransition("REFUNDED", "PAID")).toBe(false);
  });

  it("lists no targets for terminal statuses", () => {
    expect(adminTargetsFor("FULFILLED")).toEqual([]);
    expect(adminTargetsFor("CANCELLED")).toEqual([]);
    expect(adminTargetsFor("REFUNDED")).toEqual([]);
  });

  it("lists the documented target for each actionable status", () => {
    expect(adminTargetsFor("PAID")).toEqual(["FULFILLED"]);
    expect(adminTargetsFor("PENDING")).toEqual(["CANCELLED"]);
    expect(adminTargetsFor("REFUND_REQUIRED")).toEqual(["REFUNDED"]);
  });

  it("recognises only the six persisted statuses", () => {
    for (const status of [
      "PENDING",
      "PAID",
      "FULFILLED",
      "CANCELLED",
      "REFUND_REQUIRED",
      "REFUNDED",
    ]) {
      expect(isOrderStatus(status)).toBe(true);
    }
    expect(isOrderStatus("SHIPPED")).toBe(false);
    expect(isOrderStatus("paid")).toBe(false);
    expect(isOrderStatus("")).toBe(false);
  });
});
