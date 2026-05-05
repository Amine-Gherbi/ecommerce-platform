import { randomUUID } from "node:crypto";

import { beforeEach, describe, expect, it } from "vitest";

import { POST } from "@/app/api/webhooks/payments/route";

import {
  createPendingOrder,
  paymentEvent,
  resetDatabase,
  signedRequest,
  testDb,
  WEBHOOK_SECRET,
} from "./helpers";

beforeEach(async () => {
  await resetDatabase();
});

describe("webhook signature and transitions", () => {
  it("rejects an unsigned or wrongly signed body with 400 and writes no event", async () => {
    const rawBody = JSON.stringify({
      id: `evt_${randomUUID()}`,
      type: "payment_intent.succeeded",
      data: { paymentIntentId: "pi_demo_missing", amountCents: 1, currency: "eur" },
    });

    const unsigned = await POST(
      new Request("http://localhost/api/webhooks/payments", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: rawBody,
      }),
    );
    expect(unsigned.status).toBe(400);

    const wrongSecret = await POST(signedRequest(rawBody, { secret: "whsec_wrong" }));
    expect(wrongSecret.status).toBe(400);

    expect(await testDb.webhookEvent.count()).toBe(0);
    expect(WEBHOOK_SECRET).not.toBe("whsec_wrong");
  });

  it("records an event for an unknown payment intent and answers 200", async () => {
    const rawBody = JSON.stringify({
      id: `evt_${randomUUID()}`,
      type: "payment_intent.succeeded",
      data: {
        paymentIntentId: `pi_demo_${randomUUID()}`,
        amountCents: 1_000,
        currency: "eur",
      },
    });

    const response = await POST(signedRequest(rawBody));
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ action: "ignored" });
    expect(await testDb.webhookEvent.count()).toBe(1);
  });

  it("logs an illegal transition, returns 200 and never downgrades PAID", async () => {
    const { order } = await createPendingOrder();

    const paidBody = paymentEvent(order, `evt_${randomUUID()}`);
    expect((await POST(signedRequest(paidBody))).status).toBe(200);

    const mismatchedBody = paymentEvent(order, `evt_${randomUUID()}`, {
      amountCents: order.totalCents + 500,
    });
    const response = await POST(signedRequest(mismatchedBody));

    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ action: "illegal_transition" });

    const stored = await testDb.order.findUniqueOrThrow({
      where: { id: order.id },
      select: { status: true },
    });
    expect(stored.status).toBe("PAID");
    expect(await testDb.webhookEvent.count()).toBe(2);
  });
});
