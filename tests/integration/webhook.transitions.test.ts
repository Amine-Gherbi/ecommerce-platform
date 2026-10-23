import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { POST } from "@/app/api/webhooks/stripe/route";
import { db } from "@/lib/db";
import { isTransitionAllowed } from "@/lib/order-state";

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
  chargeRefundedEvent,
  newEventId,
  paymentCanceledEvent,
  paymentFailedEvent,
  paymentSucceededEvent,
  signedEventRequest,
  type PaymentEventOptions,
} from "./helpers/webhooks";

// The transition table, exercised through the webhook. Legal moves apply;
// illegal and late moves are answered 200 and change nothing. The event is
// always recorded, so the replay guard and the audit trail stay intact.

const previousSecret = process.env.STRIPE_WEBHOOK_SECRET;

let catalog: CatalogFixture;
let userId: string;
const eventIds: string[] = [];

beforeAll(async () => {
  process.env.STRIPE_WEBHOOK_SECRET = WEBHOOK_SECRET;
  runMigrations();
  catalog = await createCatalog({
    stock: 30,
    priceCents: 3_000,
    label: "transitions",
  });
  const users = await createUsers("transitions", 1);
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

function eventId(): string {
  const id = newEventId();
  eventIds.push(id);
  return id;
}

async function send(
  event: Readonly<Record<string, unknown>>,
): Promise<{ status: number; action: string | undefined }> {
  const response = await POST(signedEventRequest(event));
  const parsed = await readWebhook(response);
  return { status: parsed.status, action: parsed.body.action };
}

async function statusOf(orderId: string) {
  const order = await db.order.findUnique({
    where: { id: orderId },
    select: { status: true },
  });
  return order?.status;
}

function succeeded(
  options: Omit<PaymentEventOptions, "eventId">,
): Readonly<Record<string, unknown>> {
  return paymentSucceededEvent({ ...options, eventId: eventId() });
}

describe("order state machine", () => {
  it("declares the table the plan claims", () => {
    expect(isTransitionAllowed("PENDING", "PAID")).toBe(true);
    expect(isTransitionAllowed("PENDING", "CANCELLED")).toBe(true);
    expect(isTransitionAllowed("CANCELLED", "PAID")).toBe(true);
    expect(isTransitionAllowed("PAID", "FULFILLED")).toBe(true);
    expect(isTransitionAllowed("PAID", "REFUND_REQUIRED")).toBe(true);
    expect(isTransitionAllowed("REFUND_REQUIRED", "REFUNDED")).toBe(true);
    expect(isTransitionAllowed("PAYMENT_FAILED", "PAID")).toBe(true);

    expect(isTransitionAllowed("PAID", "CANCELLED")).toBe(false);
    expect(isTransitionAllowed("REFUNDED", "PAID")).toBe(false);
    expect(isTransitionAllowed("REFUNDED", "REFUNDED")).toBe(false);
  });

  it("moves PENDING to PAYMENT_FAILED and hands the stock back", async () => {
    const pending = await createPendingOrder(userId, catalog.variantId, 1);

    const result = await send(
      paymentFailedEvent({
        eventId: eventId(),
        paymentIntentId: pending.paymentIntentId,
        amountCents: pending.totalCents,
      }),
    );

    expect(result.status).toBe(200);
    expect(result.action).toBe("processed");
    expect(await statusOf(pending.orderId)).toBe("PAYMENT_FAILED");

    const reservation = await db.stockReservation.findFirst({
      where: { orderId: pending.orderId },
      select: { releasedAt: true },
    });
    expect(reservation?.releasedAt).not.toBeNull();
  });

  it("moves PENDING to CANCELLED and hands the stock back", async () => {
    const pending = await createPendingOrder(userId, catalog.variantId, 1);

    const result = await send(
      paymentCanceledEvent({
        eventId: eventId(),
        paymentIntentId: pending.paymentIntentId,
        amountCents: pending.totalCents,
      }),
    );

    expect(result.status).toBe(200);
    expect(result.action).toBe("processed");
    expect(await statusOf(pending.orderId)).toBe("CANCELLED");

    const reservation = await db.stockReservation.findFirst({
      where: { orderId: pending.orderId },
      select: { releasedAt: true },
    });
    expect(reservation?.releasedAt).not.toBeNull();
  });

  it("accepts CANCELLED to PAID: late money is still money", async () => {
    const pending = await createPendingOrder(userId, catalog.variantId, 1);

    const canceled = await send(
      paymentCanceledEvent({
        eventId: eventId(),
        paymentIntentId: pending.paymentIntentId,
        amountCents: pending.totalCents,
      }),
    );
    expect(canceled.action).toBe("processed");
    expect(await statusOf(pending.orderId)).toBe("CANCELLED");

    // The customer paid after the cancellation event. Mark it PAID rather
    // than dropping money we have actually received.
    const late = await send(
      succeeded({
        paymentIntentId: pending.paymentIntentId,
        amountCents: pending.totalCents,
      }),
    );
    expect(late.status).toBe(200);
    expect(late.action).toBe("processed");
    expect(await statusOf(pending.orderId)).toBe("PAID");
  });

  it("refuses PAID to CANCELLED and records the event anyway", async () => {
    const pending = await createPendingOrder(userId, catalog.variantId, 1);
    const paid = await send(
      succeeded({
        paymentIntentId: pending.paymentIntentId,
        amountCents: pending.totalCents,
      }),
    );
    expect(paid.action).toBe("processed");
    expect(await statusOf(pending.orderId)).toBe("PAID");

    const lateCancelId = eventId();
    const lateCancel = await send(
      paymentCanceledEvent({
        eventId: lateCancelId,
        paymentIntentId: pending.paymentIntentId,
        amountCents: pending.totalCents,
      }),
    );

    expect(lateCancel.status).toBe(200);
    expect(lateCancel.action).toBe("illegal");
    expect(await statusOf(pending.orderId)).toBe("PAID");
    expect(
      await db.webhookEvent.count({ where: { stripeEventId: lateCancelId } }),
    ).toBe(1);
  });

  it("treats a second distinct succeeded event as a late no-op", async () => {
    const pending = await createPendingOrder(userId, catalog.variantId, 1);
    await send(
      succeeded({
        paymentIntentId: pending.paymentIntentId,
        amountCents: pending.totalCents,
      }),
    );

    const late = await send(
      succeeded({
        paymentIntentId: pending.paymentIntentId,
        amountCents: pending.totalCents,
      }),
    );
    expect(late.status).toBe(200);
    expect(late.action).toBe("illegal");
    expect(await statusOf(pending.orderId)).toBe("PAID");
  });

  it("applies * to REFUNDED via charge.refunded and refuses money afterwards", async () => {
    const pending = await createPendingOrder(userId, catalog.variantId, 1);
    await send(
      succeeded({
        paymentIntentId: pending.paymentIntentId,
        amountCents: pending.totalCents,
      }),
    );

    const refunded = await send(
      chargeRefundedEvent({
        eventId: eventId(),
        paymentIntentId: pending.paymentIntentId,
        amountCents: pending.totalCents,
      }),
    );
    expect(refunded.status).toBe(200);
    expect(refunded.action).toBe("processed");
    expect(await statusOf(pending.orderId)).toBe("REFUNDED");

    // Stock returned with the refund.
    const reservation = await db.stockReservation.findFirst({
      where: { orderId: pending.orderId },
      select: { releasedAt: true },
    });
    expect(reservation?.releasedAt).not.toBeNull();

    // A late succeeded event cannot resurrect a refunded order.
    const late = await send(
      succeeded({
        paymentIntentId: pending.paymentIntentId,
        amountCents: pending.totalCents,
      }),
    );
    expect(late.status).toBe(200);
    expect(late.action).toBe("illegal");
    expect(await statusOf(pending.orderId)).toBe("REFUNDED");
  });

  it("records an event for an unknown payment intent as a 200 no-op", async () => {
    const unknown = await send(
      succeeded({
        paymentIntentId: "pi_local_doesnotexist",
        amountCents: 1_000,
      }),
    );
    expect(unknown.status).toBe(200);
    expect(unknown.action).toBe("ignored");
  });
});
