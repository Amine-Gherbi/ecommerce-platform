import { randomUUID } from "node:crypto";

import { beforeEach, describe, expect, it } from "vitest";

import { POST } from "@/app/api/webhooks/payments/route";
import { sweepExpiredReservations } from "@/lib/reservations";

import {
  createOrderAttempt,
  createVariant,
  paymentEvent,
  placeOrderForTest,
  resetDatabase,
  signedRequest,
  testDb,
} from "./helpers";

beforeEach(async () => {
  await resetDatabase();
});

// The cart is emptied by a successful checkout, so re-adding the same line to
// the same cart is what reproduces "an unchanged cart" after the order was
// cancelled: `cart.id` and the canonical lines are identical, so the content
// hash is the same one the cancelled order consumed.
async function restoreCartLine(
  userId: string,
  variantId: string,
  quantity = 1,
): Promise<void> {
  const cart = await testDb.cart.findUniqueOrThrow({
    where: { userId },
    select: { id: true, deliveryMethod: true },
  });
  await testDb.cartItem.create({
    data: { cartId: cart.id, variantId, quantity },
  });
  expect(cart.deliveryMethod).toBe("STANDARD");
}

describe("checkout after the reservation sweeper cancelled an attempt", () => {
  it("treats the unchanged cart as a new attempt with a new order and intent", async () => {
    const { variantId } = await createVariant({ priceCents: 2_900, stock: 10 });
    const attempt = await createOrderAttempt({ variantId });

    const first = await placeOrderForTest(attempt);
    if (first.kind !== "created") {
      throw new Error(`expected the first attempt to create, got ${first.kind}`);
    }
    expect(first.clientSecret).toEqual(expect.any(String));
    expect(first.order.paymentIntentId).toMatch(/^pi_/);

    // Cancel exactly the way the scheduled sweeper does: the reservation is
    // past its window, so the order moves to CANCELLED and the units return.
    const swept = await sweepExpiredReservations(
      new Date(Date.now() + 31 * 60 * 1_000),
    );
    expect(swept.cancelledOrders).toBe(1);

    const cancelled = await testDb.order.findUniqueOrThrow({
      where: { id: first.order.id },
      select: { status: true },
    });
    expect(cancelled.status).toBe("CANCELLED");

    await restoreCartLine(attempt.userId, variantId);

    const second = await placeOrderForTest(attempt);
    expect(second.kind).toBe("created");
    if (second.kind !== "created") {
      throw new Error(
        `expected the retry after cancellation to create a new order, got ${second.kind}`,
      );
    }

    // A new order, number and PaymentIntent — not the dead order replayed.
    expect(second.order.id).not.toBe(first.order.id);
    expect(second.order.number).not.toBe(first.order.number);
    expect(second.order.paymentIntentId).toMatch(/^pi_/);
    expect(second.order.paymentIntentId).not.toBe(first.order.paymentIntentId);
    expect(second.clientSecret).toEqual(expect.any(String));
    expect(second.order.status).toBe("PENDING");

    const firstStillCancelled = await testDb.order.findUniqueOrThrow({
      where: { id: first.order.id },
      select: { status: true },
    });
    expect(firstStillCancelled.status).toBe("CANCELLED");

    // The webhook resolves an order by `paymentIntentId`, so the second
    // attempt's intent pays the second order without touching the first.
    const payment = await POST(
      signedRequest(
        paymentEvent(second.order, `evt_${randomUUID()}`),
      ),
    );
    expect(payment.status).toBe(200);
    expect(await payment.json()).toMatchObject({ action: "paid" });

    const [firstAfterPayment, secondAfterPayment] = await Promise.all([
      testDb.order.findUniqueOrThrow({
        where: { id: first.order.id },
        select: { status: true },
      }),
      testDb.order.findUniqueOrThrow({
        where: { id: second.order.id },
        select: { status: true },
      }),
    ]);
    expect(firstAfterPayment.status).toBe("CANCELLED");
    expect(secondAfterPayment.status).toBe("PAID");

    // A paid attempt still blocks a second charge: the same cart returns the
    // paid order instead of creating a third one.
    const third = await placeOrderForTest(attempt);
    expect(third.kind).toBe("duplicate");
    if (third.kind !== "duplicate") {
      throw new Error("expected the paid attempt to be returned as a duplicate");
    }
    expect(third.order.id).toBe(second.order.id);
  });

  it("still returns the same order for a duplicate submit while it is PENDING", async () => {
    const { variantId } = await createVariant({ priceCents: 2_900, stock: 10 });
    const attempt = await createOrderAttempt({ variantId });

    const first = await placeOrderForTest(attempt);
    if (first.kind !== "created") {
      throw new Error(`expected the first attempt to create, got ${first.kind}`);
    }
    expect(first.order.status).toBe("PENDING");

    const duplicate = await placeOrderForTest(attempt);
    expect(duplicate.kind).toBe("duplicate");
    if (duplicate.kind !== "duplicate") {
      throw new Error("expected the pending attempt to be returned as a duplicate");
    }
    expect(duplicate.order.id).toBe(first.order.id);
    expect(duplicate.order.paymentIntentId).toBe(first.order.paymentIntentId);

    const orders = await testDb.order.count({ where: { userId: attempt.userId } });
    expect(orders).toBe(1);
  });
});
