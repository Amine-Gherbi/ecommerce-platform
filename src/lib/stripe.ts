import Stripe from "stripe";

import type {
  PaymentIntentReader,
  PaymentIntentSnapshot,
  PaymentIntentStatus,
  RefundGateway,
} from "@/lib/orders";

// Stripe is the only external service on the checkout path. Everything in this
// module is resolved lazily from `process.env` at call time, so a test can set
// a webhook secret per suite without reloading the module graph.
//
// Without `STRIPE_SECRET_KEY` the checkout still has to run end-to-end against
// Postgres (concurrency, oversell, replay). Those paths use a *local* payment
// intent: deterministic per order, clearly prefixed `pi_local_`, and never
// created in production. The live test-mode assertion that a double-submit
// produces one real PaymentIntent is skipped by the suite when no key is set.

const LOCAL_INTENT_PREFIX = "pi_local_";

// The webhook verifier needs a Stripe instance for its HMAC helpers only; it
// never issues an API request, so this placeholder key is never sent anywhere.
const VERIFIER_ONLY_KEY = "sk_test_webhook_verification_only_not_used";

let apiClient: Stripe | null = null;
let verifier: Stripe | null = null;

export class StripeNotConfiguredError extends Error {
  constructor(message = "STRIPE_SECRET_KEY is not set") {
    super(message);
    this.name = "StripeNotConfiguredError";
  }
}

export class WebhookSecretMissingError extends Error {
  constructor() {
    super("STRIPE_WEBHOOK_SECRET is not set");
    this.name = "WebhookSecretMissingError";
  }
}

export class InvalidSignatureError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "InvalidSignatureError";
  }
}

function envValue(name: string): string | null {
  const value = process.env[name]?.trim();
  return value !== undefined && value.length > 0 ? value : null;
}

export function stripeSecretKey(): string | null {
  return envValue("STRIPE_SECRET_KEY");
}

export function isStripeConfigured(): boolean {
  return stripeSecretKey() !== null;
}

function getStripe(): Stripe {
  const key = stripeSecretKey();
  if (key === null) {
    throw new StripeNotConfiguredError();
  }
  apiClient ??= new Stripe(key);
  return apiClient;
}

export interface PaymentIntentRef {
  id: string;
  clientSecret: string | null;
  live: boolean;
}

export interface CreatedPaymentIntent extends PaymentIntentRef {
  amountCents: number;
  currency: string;
}

export interface CreatePaymentIntentArgs {
  orderId: string;
  amountCents: number;
  currency: string;
}

function localIntent(
  orderId: string,
  amountCents: number,
  currency: string,
): CreatedPaymentIntent {
  const id = `${LOCAL_INTENT_PREFIX}${orderId.replace(/-/g, "")}`;
  return {
    id,
    clientSecret: `${id}_secret_local`,
    amountCents,
    currency,
    live: false,
  };
}

function isLocalIntentId(id: string): boolean {
  return id.startsWith(LOCAL_INTENT_PREFIX);
}

/**
 * Creates the PaymentIntent for an order.
 *
 * The idempotency key is derived from the order id, not from the request, so
 * two concurrent submits of the same order converge on one intent at Stripe.
 */
export async function createPaymentIntentForOrder(
  args: CreatePaymentIntentArgs,
): Promise<CreatedPaymentIntent> {
  if (!isStripeConfigured()) {
    if (process.env.NODE_ENV === "production") {
      throw new StripeNotConfiguredError(
        "Refusing to create a local payment intent in production",
      );
    }
    return localIntent(args.orderId, args.amountCents, args.currency);
  }

  const intent = await getStripe().paymentIntents.create(
    {
      amount: args.amountCents,
      currency: args.currency,
      automatic_payment_methods: { enabled: true },
      metadata: { orderId: args.orderId },
    },
    { idempotencyKey: `pi_${args.orderId}` },
  );

  return {
    id: intent.id,
    clientSecret: intent.client_secret,
    amountCents: intent.amount,
    currency: intent.currency,
    live: true,
  };
}

/** Re-reads an intent created earlier, so a replay returns the same secret. */
export async function retrievePaymentIntent(
  id: string,
): Promise<PaymentIntentRef> {
  if (isLocalIntentId(id)) {
    return { id, clientSecret: `${id}_secret_local`, live: false };
  }
  if (!isStripeConfigured()) {
    throw new StripeNotConfiguredError(
      "Cannot retrieve a live PaymentIntent without STRIPE_SECRET_KEY",
    );
  }
  const intent = await getStripe().paymentIntents.retrieve(id);
  return { id: intent.id, clientSecret: intent.client_secret, live: true };
}

/**
 * Verifies `Stripe-Signature` against the raw body.
 *
 * Must be given the *text* body: re-serialising JSON changes bytes and breaks
 * the HMAC. Throws `InvalidSignatureError` for anything that does not verify,
 * which the route maps to 400 without touching the database.
 */
export function verifyStripeEvent(
  payload: string,
  signature: string | null,
): Stripe.Event {
  const secret = envValue("STRIPE_WEBHOOK_SECRET");
  if (secret === null) {
    throw new WebhookSecretMissingError();
  }
  if (signature === null || signature.trim().length === 0) {
    throw new InvalidSignatureError("missing stripe-signature header");
  }

  verifier ??= new Stripe(VERIFIER_ONLY_KEY);
  try {
    return verifier.webhooks.constructEvent(payload, signature, secret);
  } catch (error: unknown) {
    throw new InvalidSignatureError(
      error instanceof Error ? error.message : "signature verification failed",
    );
  }
}

/**
 * The real Stripe implementation of the reconciliation job's only dependency.
 *
 * Kept behind `PaymentIntentReader` so tests inject a fixture instead of
 * needing a key, and so the job never imports the SDK directly. Without a key
 * the reader throws `StripeNotConfiguredError`; the job counts that order as
 * failed and continues with the rest of the batch.
 */
function normalizeIntentStatus(
  status: Stripe.PaymentIntent.Status,
): PaymentIntentStatus {
  switch (status) {
    case "requires_payment_method":
      return "requires_payment_method";
    case "requires_confirmation":
      return "requires_confirmation";
    case "requires_action":
      return "requires_action";
    case "processing":
      return "processing";
    case "requires_capture":
      return "requires_capture";
    case "canceled":
      return "canceled";
    case "succeeded":
      return "succeeded";
    default:
      // A status newer than this build is still in flight as far as the job
      // is concerned; the sweeper owns eventual expiry.
      return "processing";
  }
}

export function createPaymentIntentReader(): PaymentIntentReader {
  return {
    async retrievePaymentIntent(id: string): Promise<PaymentIntentSnapshot> {
      const intent = await getStripe().paymentIntents.retrieve(id);
      return {
        id: intent.id,
        status: normalizeIntentStatus(intent.status),
        amount: intent.amount,
        amount_received: intent.amount_received,
        currency: intent.currency,
      };
    },
  };
}

/**
 * The real Stripe implementation of the refund path.
 *
 * The idempotency key is supplied by the caller (it is derived from our order
 * id), so retrying an ambiguous failure cannot create a second refund.
 */
export function createRefundGateway(): RefundGateway {
  return {
    async refund(paymentIntentId: string, idempotencyKey: string) {
      const refund = await getStripe().refunds.create(
        { payment_intent: paymentIntentId },
        { idempotencyKey },
      );
      return { id: refund.id, status: refund.status ?? "unknown" };
    },
  };
}
