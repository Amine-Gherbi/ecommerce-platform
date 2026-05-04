import { randomUUID } from "node:crypto";

import Stripe from "stripe";

// Signed webhook fixtures. `generateTestHeaderString` is the same HMAC the
// live Stripe CLI produces, so these tests exercise the real
// `constructEvent` path without a network call or a secret key.

export const WEBHOOK_SECRET = "whsec_p2_m4_fixture_secret";

const signer = new Stripe("sk_test_fixture_signing_only");

let eventCounter = 0;

export function newEventId(prefix = "evt"): string {
  eventCounter += 1;
  return `${prefix}_${Date.now()}_${eventCounter}_${randomUUID().replace(/-/g, "").slice(0, 10)}`;
}

export interface SignedRequestOptions {
  /** Omit the header entirely when `null`. */
  signature?: string | null;
  secret?: string;
  /** Body actually sent; defaults to the signed payload. */
  body?: string;
}

export function signedRequest(
  payload: string,
  options: SignedRequestOptions = {},
): Request {
  const headers: Record<string, string> = {
    "content-type": "application/json",
  };

  if (options.signature !== null) {
    headers["stripe-signature"] =
      options.signature ??
      signer.webhooks.generateTestHeaderString({
        payload,
        secret: options.secret ?? WEBHOOK_SECRET,
      });
  }

  return new Request("http://localhost/api/webhooks/stripe", {
    method: "POST",
    headers,
    body: options.body ?? payload,
  });
}

export function signedEventRequest(
  event: Readonly<Record<string, unknown>>,
  options: SignedRequestOptions = {},
): Request {
  return signedRequest(JSON.stringify(event), options);
}

function envelope(
  eventId: string,
  type: string,
  object: Readonly<Record<string, unknown>>,
): Record<string, unknown> {
  return {
    id: eventId,
    object: "event",
    api_version: "2025-01-27",
    created: Math.floor(Date.now() / 1_000),
    livemode: false,
    pending_webhooks: 1,
    request: { id: null, idempotency_key: null },
    type,
    data: { object },
  };
}

export interface PaymentEventOptions {
  eventId?: string;
  paymentIntentId: string;
  amountCents: number;
  amountReceivedCents?: number;
  currency?: string;
}

export function paymentSucceededEvent(
  options: PaymentEventOptions,
): Record<string, unknown> {
  return envelope(
    options.eventId ?? newEventId(),
    "payment_intent.succeeded",
    {
      id: options.paymentIntentId,
      object: "payment_intent",
      amount: options.amountCents,
      amount_received: options.amountReceivedCents ?? options.amountCents,
      currency: options.currency ?? "usd",
      status: "succeeded",
    },
  );
}

export function paymentFailedEvent(
  options: PaymentEventOptions,
): Record<string, unknown> {
  return envelope(
    options.eventId ?? newEventId(),
    "payment_intent.payment_failed",
    {
      id: options.paymentIntentId,
      object: "payment_intent",
      amount: options.amountCents,
      amount_received: 0,
      currency: options.currency ?? "usd",
      status: "requires_payment_method",
      last_payment_error: { code: "card_declined" },
    },
  );
}

export function paymentCanceledEvent(
  options: PaymentEventOptions,
): Record<string, unknown> {
  return envelope(
    options.eventId ?? newEventId(),
    "payment_intent.canceled",
    {
      id: options.paymentIntentId,
      object: "payment_intent",
      amount: options.amountCents,
      amount_received: 0,
      currency: options.currency ?? "usd",
      status: "canceled",
    },
  );
}

export function chargeRefundedEvent(
  options: PaymentEventOptions,
): Record<string, unknown> {
  return envelope(options.eventId ?? newEventId(), "charge.refunded", {
    id: `ch_${randomUUID().replace(/-/g, "").slice(0, 16)}`,
    object: "charge",
    payment_intent: options.paymentIntentId,
    amount: options.amountCents,
    amount_refunded: options.amountCents,
    currency: options.currency ?? "usd",
    refunded: true,
  });
}
