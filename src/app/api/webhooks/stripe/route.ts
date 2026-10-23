import type Stripe from "stripe";

import { isUniqueViolation } from "@/lib/prisma-errors";
import {
  InvalidSignatureError,
  WebhookSecretMissingError,
  verifyStripeEvent,
} from "@/lib/stripe";
import { processStripeEvent } from "@/lib/webhook";

// POST /api/webhooks/stripe
//
// Mechanics that break silently when wrong, and are therefore pinned here:
//   * Node runtime (the Stripe SDK and Prisma are not Edge-safe)
//   * `force-dynamic` — no caching of a webhook
//   * `await request.text()` BEFORE anything parses the body; the signature is
//     an HMAC over the exact bytes Stripe sent
//   * the middleware matcher excludes `/api/webhooks`
//
// Status policy: 200 for replays and illegal transitions (Stripe retries
// non-2xx for three days and retrying cannot fix either), 400 only for a body
// that does not verify, 500 for transient failures we want retried.

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

export async function POST(request: Request): Promise<Response> {
  const rawBody = await request.text();

  let event: Stripe.Event;
  try {
    event = verifyStripeEvent(
      rawBody,
      request.headers.get("stripe-signature"),
    );
  } catch (error: unknown) {
    if (error instanceof WebhookSecretMissingError) {
      // Misconfiguration, not a bad request: fail loudly so the deployment is
      // fixed, and let Stripe retry while it is.
      console.error("[webhook] STRIPE_WEBHOOK_SECRET is not set");
      return json(
        { error: "WEBHOOK_NOT_CONFIGURED", message: "Webhook secret missing" },
        500,
      );
    }
    if (error instanceof InvalidSignatureError) {
      console.warn(`[webhook] signature rejected: ${error.message}`);
      return json(
        { error: "INVALID_SIGNATURE", message: "Signature verification failed" },
        400,
      );
    }
    console.error("[webhook] verification failed", error);
    return json(
      { error: "INVALID_SIGNATURE", message: "Signature verification failed" },
      400,
    );
  }

  try {
    const outcome = await processStripeEvent(event);
    if (outcome.action === "illegal") {
      console.warn(
        `[webhook] ignored illegal transition ${String(outcome.from)} -> ${String(outcome.to)} for ${String(outcome.orderId)}`,
      );
    }
    return json({ received: true, action: outcome.action }, 200);
  } catch (error: unknown) {
    if (isUniqueViolation(error)) {
      // Same Stripe event id seen twice: the first delivery owns the effect.
      return json({ received: true, action: "duplicate" }, 200);
    }
    console.error("[webhook] processing failed", error);
    return json(
      { error: "PROCESSING_FAILED", message: "Transient failure; retry" },
      500,
    );
  }
}
