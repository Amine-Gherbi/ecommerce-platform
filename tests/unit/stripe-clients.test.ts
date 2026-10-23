import { afterEach, beforeEach, describe, expect, it } from "vitest";

import {
  createPaymentIntentReader,
  createRefundGateway,
  StripeNotConfiguredError,
} from "@/lib/stripe";

// The job and refund path depend on these thin adapters. With no secret key
// they must fail loudly (the job counts the order as failed and moves on),
// never fabricate a success.

const previousKey = process.env.STRIPE_SECRET_KEY;

beforeEach(() => {
  delete process.env.STRIPE_SECRET_KEY;
});

afterEach(() => {
  if (previousKey === undefined) {
    delete process.env.STRIPE_SECRET_KEY;
  } else {
    process.env.STRIPE_SECRET_KEY = previousKey;
  }
});

describe("Stripe adapters without a key", () => {
  it("refuses to retrieve a live PaymentIntent instead of faking one", async () => {
    const reader = createPaymentIntentReader();
    await expect(
      reader.retrievePaymentIntent("pi_live_not_a_fixture"),
    ).rejects.toBeInstanceOf(StripeNotConfiguredError);
  });

  it("refuses to refund instead of reporting a fake refund", async () => {
    const gateway = createRefundGateway();
    await expect(
      gateway.refund("pi_live_not_a_fixture", "refund_key"),
    ).rejects.toBeInstanceOf(StripeNotConfiguredError);
  });
});
