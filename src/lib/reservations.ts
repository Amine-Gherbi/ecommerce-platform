// Stock is reserved at checkout for 30 minutes. Releasing a reservation is
// idempotent: the compare-and-set on `releasedAt IS NULL` decides which caller
// restores the units, so a webhook and the sweeper cannot both add them back.

import type { Prisma } from "@prisma/client";

import { db } from "@/lib/db";

export interface SweepResult {
  cancelledOrders: number;
  releasedReservations: number;
}

export async function releaseReservationsForOrder(
  tx: Prisma.TransactionClient,
  orderId: string,
  releasedAt: Date = new Date(),
): Promise<number> {
  const reservations = await tx.stockReservation.findMany({
    where: { orderId, releasedAt: null },
    orderBy: { variantId: "asc" },
    select: { id: true, variantId: true, quantity: true },
  });

  let released = 0;

  for (const reservation of reservations) {
    const claimed = await tx.stockReservation.updateMany({
      where: { id: reservation.id, releasedAt: null },
      data: { releasedAt },
    });
    if (claimed.count === 0) {
      continue;
    }

    await tx.$executeRaw`
      UPDATE "Variant"
      SET stock = stock + ${reservation.quantity}
      WHERE id = ${reservation.variantId}::uuid
    `;
    released += 1;
  }

  return released;
}

// Cancels PENDING orders whose reservation window has passed and restores
// their stock in the same transaction. The `status = 'PENDING'` predicate is
// the compare-and-set that lets a webhook win cleanly: if the webhook paid the
// order first, zero rows are updated and the units stay sold.
export async function sweepExpiredReservations(
  now: Date = new Date(),
): Promise<SweepResult> {
  return db.$transaction(async (tx): Promise<SweepResult> => {
    // `expiresAt` is a naive timestamp; Prisma binds this Date in the same UTC
    // wall-clock representation checkout wrote, so the comparison is
    // independent of the database session timezone.
    const expired = await tx.stockReservation.findMany({
      where: {
        releasedAt: null,
        expiresAt: { lt: now },
        order: { status: "PENDING" },
      },
      orderBy: [{ variantId: "asc" }, { id: "asc" }],
      select: { orderId: true },
    });

    const orderIds = [...new Set(expired.map((reservation) => reservation.orderId))];

    let cancelledOrders = 0;
    let releasedReservations = 0;

    for (const orderId of orderIds) {
      const cancelled = await tx.$executeRaw`
        UPDATE "Order"
        SET status = 'CANCELLED'
        WHERE id = ${orderId}::uuid AND status = 'PENDING'
      `;

      if (cancelled !== 1) {
        console.warn(
          `[reservation-sweeper] order=${orderId} was settled before it could be cancelled`,
        );
        continue;
      }

      cancelledOrders += 1;
      releasedReservations += await releaseReservationsForOrder(tx, orderId, now);
    }

    return { cancelledOrders, releasedReservations };
  });
}
