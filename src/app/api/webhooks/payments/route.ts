import {
  parsePaymentsEvent,
  processPaymentsEvent,
} from "@/lib/payments-webhook";
import { constructStripeEvent, webhookSecret } from "@/lib/stripe";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// The body is read as text before anything parses it: the Stripe signature
// covers the exact bytes the provider sent. A missing or wrong signature is the
// only 400 here (the caller is not Stripe). Everything Stripe might retry —
// replays, unknown orders, illegal transitions — answers 200.
export async function POST(request: Request): Promise<Response> {
  const rawBody = await request.text();
  const secret = webhookSecret();

  if (secret === null) {
    // Fail closed: an unconfigured secret rejects the delivery rather than
    // skipping verification. Stripe retries while the host is misconfigured.
    return Response.json(
      { error: "WEBHOOK_NOT_CONFIGURED" },
      { status: 503 },
    );
  }

  const signature = request.headers.get("stripe-signature");
  if (signature === null || signature.trim().length === 0) {
    return Response.json({ error: "INVALID_SIGNATURE" }, { status: 400 });
  }

  let event;
  try {
    event = constructStripeEvent(rawBody, signature, secret);
  } catch {
    return Response.json({ error: "INVALID_SIGNATURE" }, { status: 400 });
  }

  const paymentsEvent = parsePaymentsEvent(event);
  if (paymentsEvent === null) {
    // Signed by Stripe but not a shape we understand: accept it so Stripe does
    // not retry a body we can never process.
    console.warn("[payments-webhook] signed body was not a valid event");
    return Response.json({ action: "ignored" }, { status: 200 });
  }

  const result = await processPaymentsEvent(paymentsEvent);
  return Response.json(result, { status: 200 });
}
