import {
  parsePaymentsEvent,
  paymentsWebhookSecret,
  processPaymentsEvent,
} from "@/lib/payments-webhook";
import { verifySignature } from "@/lib/webhook-signature";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// The body is read as text before anything parses it: the signature covers the
// exact bytes the provider sent. A missing or wrong signature is the only 400
// here (the caller is not the provider). Everything the provider might retry —
// replays, unknown orders, illegal transitions — answers 200.
export async function POST(request: Request): Promise<Response> {
  const rawBody = await request.text();
  const secret = paymentsWebhookSecret();

  if (secret === null) {
    return Response.json(
      { error: "WEBHOOK_NOT_CONFIGURED" },
      { status: 503 },
    );
  }

  const signature = request.headers.get("x-payments-signature");

  if (!verifySignature(signature, rawBody, secret)) {
    return Response.json({ error: "INVALID_SIGNATURE" }, { status: 400 });
  }

  const event = parsePaymentsEvent(rawBody);
  if (event === null) {
    // Signed by the provider but not a shape we understand: accept it so the
    // provider does not retry a body we can never process.
    console.warn("[payments-webhook] signed body was not a valid event");
    return Response.json({ action: "ignored" }, { status: 200 });
  }

  const result = await processPaymentsEvent(event);
  return Response.json(result, { status: 200 });
}
