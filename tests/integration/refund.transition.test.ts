import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";

import { db } from "@/lib/db";
import {
  applyTransition,
  markRefundRequired,
  refundOrder,
  type RefundGateway,
} from "@/lib/orders";

import {
  cleanupFixture,
  createCatalog,
  createPendingOrder,
  createUsers,
  runMigrations,
  type CatalogFixture,
} from "./helpers/fixtures";

// The refund path. An order that cannot be fulfilled goes to REFUND_REQUIRED
// and returns its stock; it may become REFUNDED only after the refund call
// returned successfully. The transition is a compare-and-set, so a second
// attempt finds 0 rows, reports it, and does not refund twice.

let catalog: CatalogFixture;
let userId: string;
const orderIds: string[] = [];

beforeAll(async () => {
  runMigrations();
  catalog = await createCatalog({
    stock: 5,
    priceCents: 7_500,
    label: "refund",
  });
  const users = await createUsers("refund", 1);
  const first = users[0];
  if (first === undefined) {
    throw new Error("no user fixture");
  }
  userId = first;
}, 120_000);

afterEach(async () => {
  if (orderIds.length > 0) {
    const held = await db.stockReservation.findMany({
      where: { orderId: { in: [...orderIds] }, releasedAt: null },
      select: { variantId: true, qty: true },
    });
    for (const reservation of held) {
      await db.variant.update({
        where: { id: reservation.variantId },
        data: { stock: { increment: reservation.qty } },
      });
    }
    await db.stockReservation.deleteMany({
      where: { orderId: { in: [...orderIds] } },
    });
    await db.orderItem.deleteMany({
      where: { orderId: { in: [...orderIds] } },
    });
    await db.order.deleteMany({ where: { id: { in: [...orderIds] } } });
    orderIds.length = 0;
  }
});

afterAll(async () => {
  await cleanupFixture({ userIds: [userId], catalogs: [catalog] });
  await db.$disconnect();
});

async function pending(quantity = 1) {
  const fixture = await createPendingOrder(userId, catalog.variantId, quantity);
  orderIds.push(fixture.orderId);
  return fixture;
}

async function markPaid(orderId: string): Promise<void> {
  await db.order.update({ where: { id: orderId }, data: { status: "PAID" } });
}

function fakeGateway(): {
  gateway: RefundGateway;
  calls: Array<{ paymentIntentId: string; idempotencyKey: string }>;
} {
  const calls: Array<{ paymentIntentId: string; idempotencyKey: string }> = [];
  return {
    calls,
    gateway: {
      async refund(paymentIntentId, idempotencyKey) {
        calls.push({ paymentIntentId, idempotencyKey });
        return { id: "re_test_refund", status: "succeeded" };
      },
    },
  };
}

async function statusOf(orderId: string): Promise<string | undefined> {
  const order = await db.order.findUnique({
    where: { id: orderId },
    select: { status: true },
  });
  return order?.status;
}

describe("refund transitions", () => {
  it("goes PAID -> REFUND_REQUIRED -> REFUNDED, refunding once and returning stock", async () => {
    const fixture = await pending(1);
    await markPaid(fixture.orderId);
    const stockBeforeCheckout = (await db.variant.findUnique({
      where: { id: catalog.variantId },
      select: { stock: true },
    }))?.stock;

    expect(await markRefundRequired(fixture.orderId, "damaged in warehouse")).toBe(
      true,
    );
    expect(await statusOf(fixture.orderId)).toBe("REFUND_REQUIRED");

    // Fulfilment abandoned: the units go back before the refund completes.
    const reservation = await db.stockReservation.findFirst({
      where: { orderId: fixture.orderId },
      select: { releasedAt: true },
    });
    expect(reservation?.releasedAt).not.toBeNull();
    const stockAfterRelease = await db.variant.findUnique({
      where: { id: catalog.variantId },
      select: { stock: true },
    });
    expect(stockAfterRelease?.stock).toBe((stockBeforeCheckout ?? 0) + 1);

    const { gateway, calls } = fakeGateway();
    expect(await refundOrder(fixture.orderId, gateway)).toBe("refunded");
    expect(await statusOf(fixture.orderId)).toBe("REFUNDED");
    expect(calls).toEqual([
      {
        paymentIntentId: fixture.paymentIntentId,
        idempotencyKey: `refund_${fixture.orderId}`,
      },
    ]);
  }, 60_000);

  it("is a 0-row no-op on the second call and does not refund again", async () => {
    const fixture = await pending(1);
    await markPaid(fixture.orderId);
    await markRefundRequired(fixture.orderId, "out of stock");

    const { gateway, calls } = fakeGateway();
    expect(await refundOrder(fixture.orderId, gateway)).toBe("refunded");

    // Second run: the status is already REFUNDED, so Stripe is not called.
    expect(await refundOrder(fixture.orderId, gateway)).toBe("already_refunded");
    expect(calls).toHaveLength(1);
    expect(await statusOf(fixture.orderId)).toBe("REFUNDED");

    // The raw transition also reports 0 rows: this is the lost-race shape
    // every caller turns into a log line plus 200, not an exception.
    const moved = await db.$transaction((tx) =>
      applyTransition(tx, fixture.orderId, "REFUND_REQUIRED", "REFUNDED"),
    );
    expect(moved).toBe(false);
    expect(await statusOf(fixture.orderId)).toBe("REFUNDED");
  }, 60_000);

  it("stays REFUND_REQUIRED when Stripe fails, then succeeds on retry", async () => {
    const fixture = await pending(1);
    await markPaid(fixture.orderId);
    await markRefundRequired(fixture.orderId, "carrier lost the parcel");

    const failing: RefundGateway = {
      async refund() {
        throw new Error("stripe is down");
      },
    };
    expect(await refundOrder(fixture.orderId, failing)).toBe("failed");
    expect(await statusOf(fixture.orderId)).toBe("REFUND_REQUIRED");

    const { gateway, calls } = fakeGateway();
    expect(await refundOrder(fixture.orderId, gateway)).toBe("refunded");
    expect(calls).toHaveLength(1);
    expect(await statusOf(fixture.orderId)).toBe("REFUNDED");
  }, 60_000);

  it("refuses orders that are not REFUND_REQUIRED and orders with no PaymentIntent", async () => {
    const fixture = await pending(1);
    await markPaid(fixture.orderId);

    const { gateway, calls } = fakeGateway();
    expect(await refundOrder(fixture.orderId, gateway)).toBe(
      "not_refund_required",
    );
    expect(calls).toHaveLength(0);

    await markRefundRequired(fixture.orderId, "cannot fulfil");
    await db.order.update({
      where: { id: fixture.orderId },
      data: { stripePaymentIntentId: null },
    });
    expect(await refundOrder(fixture.orderId, gateway)).toBe(
      "missing_payment_intent",
    );
    expect(calls).toHaveLength(0);
    expect(await statusOf(fixture.orderId)).toBe("REFUND_REQUIRED");
  }, 60_000);
});
