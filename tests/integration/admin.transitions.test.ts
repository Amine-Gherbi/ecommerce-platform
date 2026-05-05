import { randomUUID } from "node:crypto";

import { beforeEach, describe, expect, it } from "vitest";

import { transitionOrder } from "@/lib/admin-orders";

import { createPendingOrder, resetDatabase, testDb } from "./helpers";

async function createAdmin(): Promise<string> {
  const user = await testDb.user.create({
    data: {
      email: `admin-${randomUUID()}@example.test`,
      passwordHash: "not-used-in-integration-tests",
      name: "Test Admin",
      role: "ADMIN",
    },
    select: { id: true },
  });
  return user.id;
}

describe("admin order transitions", () => {
  beforeEach(async () => {
    await resetDatabase();
  });

  it("persists PAID to FULFILLED and writes one audit row", async () => {
    const actorId = await createAdmin();
    const { order } = await createPendingOrder();

    await testDb.order.update({
      where: { id: order.id },
      data: { status: "PAID", paidAt: new Date() },
    });

    const result = await transitionOrder({
      orderId: order.id,
      target: "FULFILLED",
      actorId,
    });

    expect(result).toMatchObject({
      ok: true,
      status: "FULFILLED",
      number: order.number,
    });

    const stored = await testDb.order.findUniqueOrThrow({
      where: { id: order.id },
      select: { status: true },
    });
    expect(stored.status).toBe("FULFILLED");

    const audits = await testDb.auditLog.findMany({
      where: { entity: "Order", entityId: order.id },
    });
    expect(audits).toHaveLength(1);
    expect(audits[0]?.actorId).toBe(actorId);
    expect(audits[0]?.action).toBe("order.status_changed");
    expect(audits[0]?.detail).toMatchObject({
      number: order.number,
      from: "PAID",
      to: "FULFILLED",
    });
  });

  it("refuses FULFILLED to PAID with a message and no audit row", async () => {
    const actorId = await createAdmin();
    const { order } = await createPendingOrder();

    await testDb.order.update({
      where: { id: order.id },
      data: { status: "FULFILLED" },
    });

    const result = await transitionOrder({
      orderId: order.id,
      target: "PAID",
      actorId,
    });

    expect(result.ok).toBe(false);
    if (result.ok) {
      throw new Error("expected a refusal");
    }
    expect(result.reason).toBe("illegal");
    expect(result.message).toContain("cannot move");
    expect(result.message).toContain("Fulfilled");
    expect(result.message).toContain("Paid");

    const stored = await testDb.order.findUniqueOrThrow({
      where: { id: order.id },
      select: { status: true },
    });
    expect(stored.status).toBe("FULFILLED");
    expect(
      await testDb.auditLog.count({
        where: { entity: "Order", entityId: order.id },
      }),
    ).toBe(0);
  });

  it("cancels a pending order, restores stock and releases its reservation", async () => {
    const actorId = await createAdmin();
    const { order, variantId, initialStock } = await createPendingOrder({
      stock: 5,
      quantity: 2,
    });

    const afterCheckout = await testDb.variant.findUniqueOrThrow({
      where: { id: variantId },
      select: { stock: true },
    });
    expect(afterCheckout.stock).toBe(initialStock - 2);

    const result = await transitionOrder({
      orderId: order.id,
      target: "CANCELLED",
      actorId,
    });

    expect(result.ok).toBe(true);

    const stored = await testDb.order.findUniqueOrThrow({
      where: { id: order.id },
      select: { status: true },
    });
    expect(stored.status).toBe("CANCELLED");

    const restored = await testDb.variant.findUniqueOrThrow({
      where: { id: variantId },
      select: { stock: true },
    });
    expect(restored.stock).toBe(initialStock);

    const reservation = await testDb.stockReservation.findFirstOrThrow({
      where: { orderId: order.id },
      select: { releasedAt: true },
    });
    expect(reservation.releasedAt).not.toBeNull();

    expect(
      await testDb.auditLog.count({
        where: { entity: "Order", entityId: order.id },
      }),
    ).toBe(1);
  });

  it("moves REFUND_REQUIRED to REFUNDED and records it", async () => {
    const actorId = await createAdmin();
    const { order } = await createPendingOrder();

    await testDb.order.update({
      where: { id: order.id },
      data: { status: "REFUND_REQUIRED" },
    });

    const result = await transitionOrder({
      orderId: order.id,
      target: "REFUNDED",
      actorId,
    });

    expect(result.ok).toBe(true);

    const stored = await testDb.order.findUniqueOrThrow({
      where: { id: order.id },
      select: { status: true },
    });
    expect(stored.status).toBe("REFUNDED");

    const audit = await testDb.auditLog.findFirstOrThrow({
      where: { entity: "Order", entityId: order.id },
    });
    expect(audit.detail).toMatchObject({
      from: "REFUND_REQUIRED",
      to: "REFUNDED",
    });
  });
});
