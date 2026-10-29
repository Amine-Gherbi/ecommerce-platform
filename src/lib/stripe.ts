// Stripe is the only payment provider. The server creates every PaymentIntent
// with an amount it computed from `Variant.priceCents`; the browser only ever
// sees a client secret. Webhook signatures are checked by the SDK's own
// verifier, over the raw request text.

import Stripe from "stripe";

export interface PaymentIntentRequest {
  amountCents: number;
  currency: string;
  orderId: string;
  orderNumber: string;
  idempotencyKey: string;
}

export interface CreatedPaymentIntent {
  id: string;
  clientSecret: string | null;
}

// The slice of the SDK that checkout needs. Injecting it keeps the unit test
// off the network without stubbing the verifier or the HTTP client.
export interface PaymentIntentClient {
  paymentIntents: {
    create(
      params: Stripe.PaymentIntentCreateParams,
      options?: Stripe.RequestOptions,
    ): Promise<Stripe.PaymentIntent>;
  };
}

const API_HOST_VARIABLE = "STRIPE_API_HOST";

export function stripeSecretKey(): string | null {
  return nonEmpty(process.env.STRIPE_SECRET_KEY);
}

export function webhookSecret(): string | null {
  return nonEmpty(process.env.STRIPE_WEBHOOK_SECRET);
}

function nonEmpty(value: string | undefined): string | null {
  if (value === undefined) {
    return null;
  }
  const trimmed = value.trim();
  return trimmed.length === 0 ? null : trimmed;
}

function stripeConfig(): Stripe.StripeConfig {
  // Playwright points the SDK at a local mock so the browser checkout test can
  // run without a Stripe key or an external call. Production ignores it.
  if (process.env.NODE_ENV === "production") {
    return {};
  }

  const override = nonEmpty(process.env[API_HOST_VARIABLE]);
  if (override === null) {
    return {};
  }

  const url = new URL(override);
  return {
    host: url.hostname,
    port: Number(url.port),
    protocol: url.protocol === "https:" ? "https" : "http",
  };
}

let cachedClient: Stripe | null = null;

export function getStripe(): Stripe {
  const key = stripeSecretKey();
  if (key === null) {
    throw new Error("STRIPE_SECRET_KEY is not configured");
  }
  cachedClient ??= new Stripe(key, stripeConfig());
  return cachedClient;
}

export function constructStripeEvent(
  rawBody: string,
  signature: string,
  secret: string,
): Stripe.Event {
  return Stripe.webhooks.constructEvent(rawBody, signature, secret);
}

// The idempotency key is the checkout key, not a new one: a retried request
// resolves to the same PaymentIntent instead of charging twice.
export async function createPaymentIntent(
  request: PaymentIntentRequest,
  client: PaymentIntentClient = getStripe(),
): Promise<CreatedPaymentIntent> {
  const intent = await client.paymentIntents.create(
    {
      amount: request.amountCents,
      currency: request.currency,
      metadata: {
        orderId: request.orderId,
        orderNumber: request.orderNumber,
      },
      automatic_payment_methods: { enabled: true },
    },
    { idempotencyKey: request.idempotencyKey },
  );

  return { id: intent.id, clientSecret: intent.client_secret ?? null };
}
