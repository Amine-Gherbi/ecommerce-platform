import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { POST } from "@/app/api/webhooks/stripe/route";
import { db } from "@/lib/db";

import {
  cleanupFixture,
  createCatalog,
  createPendingOrder,
  createUsers,
  runMigrations,
  type CatalogFixture,
} from "./helpers/fixtures";
import { readWebhook } from "./helpers/http";
import {
  WEBHOOK_SECRET,
  newEventId,
  paymentSucceededEvent,
  signedEventRequest,
  signedRequest,
} from "./helpers/webhooks";

// The webhook trusts nothing it cannot verify. An unsigned body, a signature
// made with another secret, or bytes that differ from the signed payload are
// rejected with 400 before the database is touched.

const previousSecret = process.env.STRIPE_WEBHOOK_SECRET;

let catalog: CatalogFixture;
let userId: string;
const eventIds: string[] = [];

beforeAll(async () => {
  process.env.STRIPE_WEBHOOK_SECRET = WEBHOOK_SECRET;
  runMigrations();
  catalog = await createCatalog({
    stock: 10,
    priceCents: 2_000,
    label: "signature",
  });
  const users = await createUsers("signature", 1);
  const first = users[0];
  if (first === undefined) {
    throw new Error("no user fixture");
  }
  userId = first;
}, 120_000);

afterAll(async () => {
  await cleanupFixture({
    userIds: [userId],
    catalogs: [catalog],
    webhookEventIds: eventIds,
  });
  if (previousSecret === undefined) {
    delete process.env.STRIPE_WEBHOOK_SECRET;
  } else {
    process.env.STRIPE_WEBHOOK_SECRET = previousSecret;
  }
  await db.$disconnect();
});

async function expectUnchanged(orderId: string, eventId: string): Promise<void> {
  const order = await db.order.findUnique({
    where: { id: orderId },
    select: { status: true },
  });
  expect(order?.status).toBe("PENDING");
  expect(
    await db.webhookEvent.count({ where: { stripeEventId: eventId } }),
  ).toBe(0);
}

describe("webhook signature verification", () => {
  it("rejects a body with no signature header", async () => {
    const pending = await createPendingOrder(userId, catalog.variantId, 1);
    const eventId = newEventId();
    eventIds.push(eventId);
    const event = paymentSucceededEvent({
      eventId,
      paymentIntentId: pending.paymentIntentId,
      amountCents: pending.totalCents,
    });

    const response = await POST(
      signedEventRequest(event, { signature: null }),
    );
    const { status, body } = await readWebhook(response);

    expect(status).toBe(400);
    expect(body.error).toBe("INVALID_SIGNATURE");
    await expectUnchanged(pending.orderId, eventId);
  });

  it("rejects a signature made with the wrong secret", async () => {
    const pending = await createPendingOrder(userId, catalog.variantId, 1);
    const eventId = newEventId();
    eventIds.push(eventId);
    const event = paymentSucceededEvent({
      eventId,
      paymentIntentId: pending.paymentIntentId,
      amountCents: pending.totalCents,
    });

    const response = await POST(
      signedEventRequest(event, { secret: "whsec_not_the_configured_one" }),
    );
    expect((await readWebhook(response)).status).toBe(400);
    await expectUnchanged(pending.orderId, eventId);
  });

  it("rejects a body that differs from the signed bytes", async () => {
    const pending = await createPendingOrder(userId, catalog.variantId, 1);
    const eventId = newEventId();
    eventIds.push(eventId);
    const event = paymentSucceededEvent({
      eventId,
      paymentIntentId: pending.paymentIntentId,
      amountCents: pending.totalCents,
    });

    // The header is computed over the original payload; the attacker sends a
    // different body under the same signature.
    const tampered = JSON.stringify({
      ...event,
      data: {
        object: {
          id: pending.paymentIntentId,
          object: "payment_intent",
          amount: 1,
          amount_received: 1,
          currency: "usd",
          status: "succeeded",
        },
      },
    });

    const response = await POST(
      signedRequest(JSON.stringify(event), { body: tampered }),
    );
    expect((await readWebhook(response)).status).toBe(400);
    await expectUnchanged(pending.orderId, eventId);
  });

  it("accepts the correctly signed body", async () => {
    const pending = await createPendingOrder(userId, catalog.variantId, 1);
    const eventId = newEventId();
    eventIds.push(eventId);
    const event = paymentSucceededEvent({
      eventId,
      paymentIntentId: pending.paymentIntentId,
      amountCents: pending.totalCents,
    });

    const response = await POST(signedEventRequest(event));
    const { status, body } = await readWebhook(response);
    expect(status).toBe(200);
    expect(body.action).toBe("processed");

    const order = await db.order.findUnique({
      where: { id: pending.orderId },
      select: { status: true },
    });
    expect(order?.status).toBe("PAID");
    expect(
      await db.webhookEvent.count({ where: { stripeEventId: eventId } }),
    ).toBe(1);
  });
});
