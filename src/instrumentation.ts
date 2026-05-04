// Next.js instrumentation hook. Runs once when a Node server process starts.
//
// The platform this app targets (Next on Node 22) provides no scheduler, so
// the reservation sweeper is an in-process 5-minute interval started here. It
// is deliberately *not* the only way to sweep: `sweepExpiredReservations` is a
// plain function, so a platform cron can call it through
// `POST /api/jobs/reconcile`-style plumbing or a worker without changing the
// logic. See docs/OPERATIONS.md for the cron contract.
//
// The work is dynamic-imported: instrumentation is evaluated for every runtime
// bundle, and Prisma must not be pulled into an Edge bundle. The Node-only
// guard runs first, before anything else is loaded.
export async function register(): Promise<void> {
  if (process.env.NEXT_RUNTIME !== "nodejs") {
    return;
  }
  // Static generation also loads instrumentation. A build must not open
  // database connections or start timers.
  if (
    process.env.NEXT_PHASE === "phase-production-build" ||
    process.env.NODE_ENV === "test" ||
    process.env.VITEST === "true"
  ) {
    return;
  }

  const { startReservationSweeper } = await import("./lib/reservations");
  startReservationSweeper();
}
