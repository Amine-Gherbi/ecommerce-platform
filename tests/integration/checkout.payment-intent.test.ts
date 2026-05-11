import { createHash } from "node:crypto";

import { beforeEach, describe, expect, it } from "vitest";

import { placeOrder, type PlaceOrderDeps } from "@/lib/checkout";
import type { PaymentIntentRequest } from "@/lib/stripe";

import {
  createAddress,
  createCartWithLine,
  createUser,
  createVariant,
  resetDatabase,
  testDb,
} from "./helpers";

beforeEach(async () => {
  await resetDatabase();
});

describe("Stripe PaymentIntent creation", () => {
  it("creates the intent from the server total, with order metadata and the checkout key", async () => {
    const { variantId } = await createVariant({ priceCents: 2_000, stock: 5 });
    const userId = await createUser();
    const addressId = await createAddress(userId);
    const { cartId, version } = await createCartWithLine({
      userId,
      variantId,
      quantity: 2,
    });

    const requests: PaymentIntentRequest[] = [];
    const deps: PlaceOrderDeps = {
      createPaymentIntent: async (request) => {
        requests.push(request);
        return { id: "pi_3FromTest", clientSecret: "pi_3FromTest_secret" };
      },
    };

    const result = await placeOrder(
      { userId, addressId, cartVersion: version },
      deps,
    );
    expect(result.kind).toBe("created");
    if (result.kind !== "created") {
      throw new Error("expected a created order");
    }

    expect(requests).toHaveLength(1);
    expect(requests[0]).toEqual({
      amountCents: 4_490, // 2 × €20.00 + €4.90 standard shipping
      currency: "eur",
      orderId: result.order.id,
      orderNumber: result.order.number,
      idempotencyKey: createHash("sha256")
        .update(`${cartId}:${version}`)
        .digest("hex"),
    });

    expect(result.order.paymentIntentId).toBe("pi_3FromTest");
    expect(result.clientSecret).toBe("pi_3FromTest_secret");

    const stored = await testDb.order.findUniqueOrThrow({
      where: { id: result.order.id },
      select: { paymentIntentId: true, status: true, totalCents: true },
    });
    expect(stored).toEqual({
      paymentIntentId: "pi_3FromTest",
      status: "PENDING",
      totalCents: 4_490,
    });
  });

  it("rolls the stock decrement back when the intent cannot be created", async () => {
    const { variantId } = await createVariant({ priceCents: 2_000, stock: 5 });
    const userId = await createUser();
    const addressId = await createAddress(userId);
    const { version } = await createCartWithLine({
      userId,
      variantId,
      quantity: 2,
    });

    const deps: PlaceOrderDeps = {
      createPaymentIntent: async () => {
        throw new Error("stripe is unreachable");
      },
    };

    await expect(
      placeOrder({ userId, addressId, cartVersion: version }, deps),
    ).rejects.toThrow("stripe is unreachable");

    expect(await testDb.order.count()).toBe(0);
    expect(await testDb.stockReservation.count()).toBe(0);
    expect(
      (
        await testDb.variant.findUniqueOrThrow({
          where: { id: variantId },
          select: { stock: true },
        })
      ).stock,
    ).toBe(5);
  });
});
