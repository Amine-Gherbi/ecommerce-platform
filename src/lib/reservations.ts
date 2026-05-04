import { db } from "@/lib/db";
import { applyTransition, releaseReservations } from "@/lib/orders";

// The reservation sweeper.
//
// Checkout reserves stock for 30 minutes. If the customer never pays, the
// reservation must not hold units hostage forever: this job finds reservations
// that expired on an order that is still PENDING, cancels that order and puts
// the units back on the shelf.
//
// Ordering inside the transaction matters. The status moves first, as a
// compare-and-set; stock is released only when that move succeeded. A webhook
// that settles the order concurrently therefore wins cleanly — the sweeper
// sees 0 rows, releases nothing, and the PAID order keeps its reservation.
// A refund/cancel that already released the stock is handled by
// `releasedAt IS NULL`, which makes release itself idempotent.

export const SWEEP_INTERVAL_MS = 5 * 60 * 1_000;
export const SWEEP_BATCH_SIZE = 500;

export interface SweepSummary {
  ordersCancelled: number;
  reservationsReleased: number;
  unitsRestored: number;
  skipped: number;
}

/**
 * Releases every reservation that expired on a still-PENDING order.
 *
 * `now` is injectable so tests can expire reservations deterministically
 * without sleeping. The batch is bounded: a backlog is drained over several
 * runs instead of one long transaction.
 */
export async function sweepExpiredReservations(
  now: Date = new Date(),
  batchSize: number = SWEEP_BATCH_SIZE,
): Promise<SweepSummary> {
  const expired = await db.stockReservation.findMany({
    where: {
      releasedAt: null,
      expiresAt: { lt: now },
      order: { status: "PENDING" },
    },
    select: { orderId: true, expiresAt: true },
    orderBy: { expiresAt: "asc" },
    take: batchSize,
  });

  const orderIds = [...new Set(expired.map((row) => row.orderId))];

  const summary: SweepSummary = {
    ordersCancelled: 0,
    reservationsReleased: 0,
    unitsRestored: 0,
    skipped: 0,
  };

  for (const orderId of orderIds) {
    const outcome = await db.$transaction(
      async (tx) => {
        const cancelled = await applyTransition(
          tx,
          orderId,
          "PENDING",
          "CANCELLED",
        );
        if (!cancelled) {
          // The order was paid, already cancelled, or settled by the
          // reconciliation job between the query and this transaction.
          return null;
        }
        return releaseReservations(tx, orderId);
      },
      { maxWait: 20_000, timeout: 20_000 },
    );

    if (outcome === null) {
      summary.skipped += 1;
      console.warn(
        `[sweeper] order ${orderId} was no longer PENDING; reservations left alone`,
      );
      continue;
    }

    summary.ordersCancelled += 1;
    summary.reservationsReleased += outcome.reservations;
    summary.unitsRestored += outcome.units;
  }

  if (summary.ordersCancelled > 0 || summary.skipped > 0) {
    console.info(
      `[sweeper] cancelled=${summary.ordersCancelled} released=${summary.reservationsReleased} units=${summary.unitsRestored} skipped=${summary.skipped}`,
    );
  }

  return summary;
}

let sweepTimer: ReturnType<typeof setInterval> | null = null;

/**
 * Starts the in-process 5-minute loop. Called once from
 * `src/instrumentation.ts`; the route `/api/jobs/reconcile` covers the
 * dropped-webhook case, while this loop covers expired reservations.
 *
 * The timer is `unref`'d so it never keeps a process alive, and starting twice
 * is a no-op (Next can evaluate instrumentation more than once in dev).
 */
export function startReservationSweeper(intervalMs = SWEEP_INTERVAL_MS): void {
  if (sweepTimer !== null) {
    return;
  }

  const run = (): void => {
    void sweepExpiredReservations().catch((error: unknown) => {
      console.error("[sweeper] run failed", error);
    });
  };

  run();
  sweepTimer = setInterval(run, intervalMs);
  sweepTimer.unref?.();
  console.info(`[sweeper] started; interval ${intervalMs} ms`);
}

export function stopReservationSweeper(): void {
  if (sweepTimer !== null) {
    clearInterval(sweepTimer);
    sweepTimer = null;
  }
}
