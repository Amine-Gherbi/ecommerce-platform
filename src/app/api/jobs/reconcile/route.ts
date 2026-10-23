import { timingSafeEqual } from "node:crypto";

import { reconcilePendingOrders } from "@/lib/orders";
import { createPaymentIntentReader } from "@/lib/stripe";

// POST /api/jobs/reconcile — the webhook that never arrives.
//
// Stripe retries a failed webhook for three days, but it does not promise to
// deliver one at all (a misconfigured endpoint, a deleted destination, an
// event created before the endpoint existed). This job closes that hole:
// every PENDING order older than two minutes is reconciled against the
// PaymentIntent that Stripe actually holds.
//
// It is idempotent. Orders that are no longer PENDING are not touched, and
// each status move is `UPDATE ... WHERE id = $1 AND status = $2`; running it
// twice changes nothing, settles nothing twice, and releases no stock twice.
//
// Scheduling. The platform provides no scheduler, so the deployment's cron
// calls this route. Recommended platform cron expression: `*/5 * * * *`
// (every five minutes, matching the reservation sweeper's interval):
//
//   curl -X POST https://<host>/api/jobs/reconcile \
//     -H "authorization: Bearer $JOBS_SECRET"
//
// Auth: when JOBS_SECRET is set, the bearer token must match it. Without the
// secret the route is open in development/test (so the suite can call the
// handler directly) and refuses with 503 in production — fail closed rather
// than expose an unauthenticated job. The nightly invariants are unaffected:
// the job only reads PENDING orders and applies legal transitions.
//
// Status policy: 200 with the run summary even when some PaymentIntents could
// not be retrieved (the next cron run retries them). 500 only for a failure
// outside the per-order loop, which the cron should surface.

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function json(body: unknown, status: number): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store",
    },
  });
}

type Authorization = "ok" | "denied" | "unconfigured";

function authorize(request: Request): Authorization {
  const secret = process.env.JOBS_SECRET?.trim();
  if (secret === undefined || secret.length === 0) {
    // Tests and local development have no secret; production must have one.
    return process.env.NODE_ENV === "production" ? "unconfigured" : "ok";
  }

  const header = request.headers.get("authorization");
  if (header === null || !header.startsWith("Bearer ")) {
    return "denied";
  }
  const supplied = Buffer.from(header.slice("Bearer ".length), "utf8");
  const expected = Buffer.from(secret, "utf8");
  if (supplied.length !== expected.length) {
    return "denied";
  }
  return timingSafeEqual(supplied, expected) ? "ok" : "denied";
}

export async function POST(request: Request): Promise<Response> {
  const authorization = authorize(request);
  if (authorization === "unconfigured") {
    console.error("[reconcile] JOBS_SECRET is not set in production");
    return json(
      { error: "JOB_NOT_CONFIGURED", message: "JOBS_SECRET is not set" },
      503,
    );
  }
  if (authorization === "denied") {
    return json({ error: "FORBIDDEN", message: "Invalid job token" }, 401);
  }

  try {
    const summary = await reconcilePendingOrders(createPaymentIntentReader());
    return json({ ok: true, ...summary }, 200);
  } catch (error: unknown) {
    console.error("[reconcile] job failed", error);
    return json(
      { error: "RECONCILE_FAILED", message: "Reconciliation run failed" },
      500,
    );
  }
}
