import Stripe from "stripe";
import { afterEach, describe, expect, it, vi } from "vitest";

import {
  constructStripeEvent,
  createPaymentIntent,
  stripeSecretKey,
  webhookSecret,
  type PaymentIntentClient,
  type PaymentIntentRequest,
} from "./stripe";

const REQUEST: PaymentIntentRequest = {
  amountCents: 2_490,
  currency: "eur",
  orderId: "11111111-1111-4111-8111-111111111111",
  orderNumber: "KST-2610-11111111",
  idempotencyKey: "sha256-of-the-cart-version",
};

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("createPaymentIntent", () => {
  it("charges the server amount in EUR with the order metadata and the checkout idempotency key", async () => {
    const calls: Array<{
      params: Record<string, unknown>;
      options: Record<string, unknown>;
    }> = [];

    const client = {
      paymentIntents: {
        create: async (
          params: Record<string, unknown>,
          options: Record<string, unknown>,
        ) => {
          calls.push({ params, options });
          return {
            id: "pi_3TestIntent",
            client_secret: "pi_3TestIntent_secret_test",
          };
        },
      },
    } as unknown as PaymentIntentClient;

    const intent = await createPaymentIntent(REQUEST, client);

    expect(intent).toEqual({
      id: "pi_3TestIntent",
      clientSecret: "pi_3TestIntent_secret_test",
    });
    expect(calls).toEqual([
      {
        params: {
          amount: 2_490,
          currency: "eur",
          metadata: {
            orderId: REQUEST.orderId,
            orderNumber: REQUEST.orderNumber,
          },
          automatic_payment_methods: { enabled: true },
        },
        options: { idempotencyKey: REQUEST.idempotencyKey },
      },
    ]);
  });

  it("returns a null client secret when Stripe did not provide one", async () => {
    const client = {
      paymentIntents: {
        create: async () => ({ id: "pi_3NoSecret" }),
      },
    } as unknown as PaymentIntentClient;

    await expect(createPaymentIntent(REQUEST, client)).resolves.toEqual({
      id: "pi_3NoSecret",
      clientSecret: null,
    });
  });
});

describe("secret configuration", () => {
  it("treats a missing or blank Stripe secret key as unconfigured", () => {
    vi.stubEnv("STRIPE_SECRET_KEY", "");
    expect(stripeSecretKey()).toBeNull();

    vi.stubEnv("STRIPE_SECRET_KEY", "   ");
    expect(stripeSecretKey()).toBeNull();

    vi.stubEnv("STRIPE_SECRET_KEY", "sk_mock_not_a_real_key");
    expect(stripeSecretKey()).toBe("sk_mock_not_a_real_key");
  });

  it("treats a missing or blank webhook secret as unconfigured", () => {
    vi.stubEnv("STRIPE_WEBHOOK_SECRET", "");
    expect(webhookSecret()).toBeNull();

    vi.stubEnv("STRIPE_WEBHOOK_SECRET", "  ");
    expect(webhookSecret()).toBeNull();

    vi.stubEnv("STRIPE_WEBHOOK_SECRET", "test-canonical-webhook-secret");
    expect(webhookSecret()).toBe("test-canonical-webhook-secret");
  });

  it("falls back to PAYMENTS_WEBHOOK_SECRET when the Stripe name is unset", () => {
    vi.stubEnv("STRIPE_WEBHOOK_SECRET", "");
    vi.stubEnv("PAYMENTS_WEBHOOK_SECRET", "test-render-generated-webhook-secret");

    expect(webhookSecret()).toBe("test-render-generated-webhook-secret");

    vi.stubEnv("STRIPE_WEBHOOK_SECRET", "test-canonical-webhook-secret");
    expect(webhookSecret()).toBe("test-canonical-webhook-secret");
  });
});

describe("constructStripeEvent", () => {
  const payload = JSON.stringify({
    id: "evt_test",
    object: "event",
    type: "payment_intent.succeeded",
    data: { object: { id: "pi_test", object: "payment_intent" } },
  });
  const secret = "test-canonical-webhook-secret";

  it("accepts a header produced by the SDK and returns the parsed event", () => {
    const header = Stripe.webhooks.generateTestHeaderString({ payload, secret });

    const event = constructStripeEvent(payload, header, secret);
    expect(event.id).toBe("evt_test");
    expect(event.type).toBe("payment_intent.succeeded");
  });

  it("rejects a header signed with another secret", () => {
    const header = Stripe.webhooks.generateTestHeaderString({
      payload,
      secret: "test-other-webhook-secret",
    });

    expect(() => constructStripeEvent(payload, header, secret)).toThrow();
  });
});
