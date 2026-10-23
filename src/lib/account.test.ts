import type { OrderStatus } from "@prisma/client";
import { describe, expect, it } from "vitest";

import {
  firstName,
  formatOrderDate,
  orderStatusLabel,
  orderTimeline,
  parseOrderAddress,
} from "./account";

describe("orderStatusLabel", () => {
  it("gives every order status the customer-facing wording", () => {
    const expected: Record<OrderStatus, string> = {
      PENDING: "Pending payment",
      PAID: "Paid",
      FULFILLED: "Fulfilled",
      CANCELLED: "Cancelled",
      REFUND_REQUIRED: "Refund required",
      REFUNDED: "Refunded",
    };

    for (const [status, label] of Object.entries(expected)) {
      expect(orderStatusLabel(status as OrderStatus)).toBe(label);
    }
  });
});

describe("formatOrderDate", () => {
  it("renders a stable UTC date regardless of the machine timezone", () => {
    expect(formatOrderDate(new Date("2026-01-31T23:30:00.000Z"))).toBe(
      "31 Jan 2026",
    );
  });
});

describe("firstName", () => {
  it("takes the first word of a trimmed name", () => {
    expect(firstName("  Ada Lovelace  ")).toBe("Ada");
  });

  it("falls back to Account when no name is available", () => {
    expect(firstName(null)).toBe("Account");
    expect(firstName(undefined)).toBe("Account");
    expect(firstName("   ")).toBe("Account");
  });
});

describe("parseOrderAddress", () => {
  const stored = {
    label: "Home",
    line1: "18 Rue de la République",
    line2: "Apt 4B",
    city: "Lyon",
    postalCode: "69001",
    country: "France",
  };

  it("reads a complete snapshot, keeping the optional second line", () => {
    expect(parseOrderAddress(stored)).toEqual(stored);
  });

  it("stores a missing second line as null", () => {
    expect(parseOrderAddress({ ...stored, line2: "" })).toEqual({
      ...stored,
      line2: null,
    });
  });

  it("rejects a snapshot that cannot render an address", () => {
    expect(parseOrderAddress(null)).toBeNull();
    expect(parseOrderAddress([])).toBeNull();
    expect(parseOrderAddress("Home")).toBeNull();
    expect(parseOrderAddress({ ...stored, city: "" })).toBeNull();
    expect(parseOrderAddress({ ...stored, country: 42 })).toBeNull();
  });
});

describe("orderTimeline", () => {
  const createdAt = new Date("2026-01-02T09:00:00.000Z");
  const paidAt = new Date("2026-01-02T09:05:00.000Z");

  it("shows placement and payment for a paid order", () => {
    expect(
      orderTimeline({ status: "PAID", createdAt, paidAt }),
    ).toEqual([
      { label: "Order placed", at: createdAt },
      { label: "Payment received", at: paidAt },
    ]);
  });

  it("shows only placement while payment is pending", () => {
    expect(orderTimeline({ status: "PENDING", createdAt, paidAt: null })).toEqual(
      [{ label: "Order placed", at: createdAt }],
    );
  });

  it("adds the terminal event without inventing a timestamp", () => {
    expect(
      orderTimeline({ status: "REFUND_REQUIRED", createdAt, paidAt }).at(-1),
    ).toEqual({ label: "Refund required", at: null });
  });
});
