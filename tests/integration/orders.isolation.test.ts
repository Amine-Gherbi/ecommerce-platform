import { randomUUID } from "node:crypto";

import { beforeEach, describe, expect, it } from "vitest";

import { findOrderForCustomer } from "@/lib/orders";

import {
  createOrderAttempt,
  createVariant,
  placeOrderForTest,
  resetDatabase,
} from "./helpers";

beforeEach(async () => {
  await resetDatabase();
});

describe("customer order isolation", () => {
  it("returns the order to its owner and null to another signed-in customer", async () => {
    const { variantId } = await createVariant({ priceCents: 2_000, stock: 5 });
    const owner = await createOrderAttempt({ variantId });
    const stranger = await createOrderAttempt({ variantId });

    const [ownerResult, strangerResult] = await Promise.all([
      placeOrderForTest(owner),
      placeOrderForTest(stranger),
    ]);

    expect(ownerResult.kind).toBe("created");
    expect(strangerResult.kind).toBe("created");
    if (ownerResult.kind !== "created" || strangerResult.kind !== "created") {
      throw new Error("expected both checkouts to create an order");
    }

    const ownOrder = await findOrderForCustomer(
      ownerResult.order.number,
      owner.userId,
    );
    expect(ownOrder?.id).toBe(ownerResult.order.id);
    expect(ownOrder?.items).toHaveLength(1);

    // The stranger knows the exact order number and is signed in — the query
    // is scoped by userId, so it still returns nothing.
    const someoneElsesOrder = await findOrderForCustomer(
      ownerResult.order.number,
      stranger.userId,
    );
    expect(someoneElsesOrder).toBeNull();

    // ...and the owner cannot read the stranger's order either.
    expect(
      await findOrderForCustomer(strangerResult.order.number, owner.userId),
    ).toBeNull();
  });

  it("does not reveal an order to an unsigned customer id", async () => {
    const { variantId } = await createVariant({ priceCents: 2_000, stock: 5 });
    const owner = await createOrderAttempt({ variantId });
    const result = await placeOrderForTest(owner);
    if (result.kind !== "created") {
      throw new Error("expected a created order");
    }

    expect(
      await findOrderForCustomer(result.order.number, randomUUID()),
    ).toBeNull();
  });
});
