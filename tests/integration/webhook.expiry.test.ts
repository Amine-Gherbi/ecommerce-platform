import { randomUUID } from "node:crypto";

import { beforeEach, describe, expect, it } from "vitest";

import { POST } from "@/app/api/webhooks/payments/route";

import {
  createPendingOrder,
  paymentEvent,
  resetDatabase,
  signedRequest,
  testDb,
} from "./helpers";

beforeEach(async () => {
  await resetDatabase();
});

// The sweeper is not called anywhere in this file. This is the timer-independent
// guarantee: a reservation that has passed its 30-minute window can never be
// turned into a paid order, even when the scheduled sweep has not run yet.
describe("webhook read-path expiry enforcement", () => {
  it("refuses a payment whose reservation has expired and releases the stock", async () => {
    const { order, variantId, initialStock } = await createPendingOrder({
      stock: 5,
      quantity: 2,
    });

    await testDb.stockReservation.updateMany({
      where: { orderId: order.id },
      data: { expiresAt: new Date(Date.now() - 60_000) },
    });

    const response = await POST(
      signedRequest(paymentEvent(order, `evt_${randomUUID()}`)),
    );

    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ action: "expired" });

    const stored = await testDb.order.findUniqueOrThrow({
      where: { id: order.id },
      select: { status: true },
    });
    expect(stored.status).toBe("REFUND_REQUIRED");

    // The units are back in the same transaction: the expiry check is not a
    // read-only rejection that leaves stock held until the next sweep.
    const stock = await testDb.variant.findUniqueOrThrow({
      where: { id: variantId },
      select: { stock: true },
    });
    expect(stock.stock).toBe(initialStock);

    const reservation = await testDb.stockReservation.findFirstOrThrow({
      where: { orderId: order.id },
      select: { releasedAt: true },
    });
    expect(reservation.releasedAt).not.toBeNull();

    // The event is recorded once, so Stripe's retry is a replay no-op.
    expect(await testDb.webhookEvent.count()).toBe(1);

    const replay = await POST(
      signedRequest(paymentEvent(order, `evt_${randomUUID()}`)),
    );
    expect(replay.status).toBe(200);
    expect(await replay.json()).toMatchObject({ action: "illegal_transition" });
    expect(await testDb.webhookEvent.count()).toBe(2);
  });
});
