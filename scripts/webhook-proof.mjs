#!/usr/bin/env node
// Live webhook proof against a running server:
//   correct amount -> PAID, replay -> 200 + one event row
//   wrong amount   -> REFUND_REQUIRED, never PAID, stock restored
//   unsigned/wrong signature -> 400 and no event row
//
//   BASE_URL=http://localhost:3200 \
//   PAYMENTS_WEBHOOK_SECRET=test-payments-webhook-secret \
//   node scripts/webhook-proof.mjs

import { createHmac, randomUUID } from "node:crypto";

import {
  checkout,
  closeFixtures,
  createShopper,
  psql,
  signIn,
} from "./lib/demo-fixtures.mjs";

const baseUrl = process.env.BASE_URL ?? "http://localhost:3200";
const secret =
  process.env.PAYMENTS_WEBHOOK_SECRET ?? "test-payments-webhook-secret";

function sign(timestamp, rawBody) {
  return createHmac("sha256", secret)
    .update(`${timestamp}.${rawBody}`)
    .digest("hex");
}

function signedHeaders(rawBody) {
  const timestamp = Math.floor(Date.now() / 1_000);
  return {
    "content-type": "application/json",
    "x-payments-signature": `t=${timestamp},v1=${sign(timestamp, rawBody)}`,
  };
}

async function postWebhook(rawBody, headers) {
  const response = await fetch(`${baseUrl}/api/webhooks/payments`, {
    method: "POST",
    headers,
    body: rawBody,
  });
  let json = null;
  try {
    json = await response.json();
  } catch {
    json = null;
  }
  return { status: response.status, body: json };
}

function eventFor(order, eventId, overrides = {}) {
  return JSON.stringify({
    id: eventId,
    type: "payment_intent.succeeded",
    data: {
      paymentIntentId: order.paymentIntentId,
      amountCents: order.totalCents,
      currency: order.currency,
      ...overrides,
    },
  });
}

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

function orderState(orderId) {
  return psql(
    `SELECT status, ("paidAt" IS NOT NULL) FROM "Order" WHERE id = '${orderId}'`,
  ).split("|");
}

function eventCount(eventId) {
  return Number(
    psql(`SELECT count(*) FROM "WebhookEvent" WHERE "eventId" = '${eventId}'`),
  );
}

async function placeOrder(label) {
  const shopper = await createShopper({ priceCents: 2_490, stock: 5 });
  const cookie = await signIn(baseUrl, shopper.email, shopper.password);
  const result = await checkout(baseUrl, cookie, shopper);
  assert(result.status === 201, `${label}: checkout returned ${result.status}`);
  return { shopper, order: result.body.order };
}

async function main() {
  console.log(`[setup] server ${baseUrl}, webhook secret configured`);

  // 1. Correct amount.
  const paid = await placeOrder("paid");
  const paidEventId = `evt_${randomUUID()}`;
  const paidBody = eventFor(paid.order, paidEventId);

  const first = await postWebhook(paidBody, signedHeaders(paidBody));
  const [statusAfterPaid, paidAtSet] = orderState(paid.order.id);
  console.log(
    `[http] correct amount -> ${first.status} ${JSON.stringify(first.body)}; psql status=${statusAfterPaid} paidAt=${paidAtSet}`,
  );
  assert(first.status === 200 && first.body?.action === "paid", "correct amount did not pay");
  assert(statusAfterPaid === "PAID" && paidAtSet === "t", "order is not PAID with paidAt");

  // 2. Replay of the same event id.
  const replay = await postWebhook(paidBody, signedHeaders(paidBody));
  const events = eventCount(paidEventId);
  console.log(
    `[http] replay -> ${replay.status} ${JSON.stringify(replay.body)}; psql WebhookEvent rows for eventId = ${events}`,
  );
  assert(replay.status === 200 && replay.body?.action === "duplicate", "replay was not a no-op");
  assert(events === 1, `expected one WebhookEvent row, got ${events}`);

  // 3. Wrong amount.
  const mismatched = await placeOrder("mismatch");
  const mismatchEventId = `evt_${randomUUID()}`;
  const mismatchBody = eventFor(mismatched.order, mismatchEventId, {
    amountCents: mismatched.order.totalCents + 1,
  });
  const mismatch = await postWebhook(mismatchBody, signedHeaders(mismatchBody));
  const [statusAfterMismatch, mismatchPaidAt] = orderState(mismatched.order.id);
  const stock = psql(`SELECT stock FROM "Variant" WHERE id = '${mismatched.shopper.variantId}'`);
  console.log(
    `[http] amount +1 -> ${mismatch.status} ${JSON.stringify(mismatch.body)}; psql status=${statusAfterMismatch} paidAt=${mismatchPaidAt} stock=${stock}`,
  );
  assert(
    mismatch.status === 200 && mismatch.body?.action === "refund_required",
    "mismatched amount did not require a refund",
  );
  assert(statusAfterMismatch === "REFUND_REQUIRED", "order is not REFUND_REQUIRED");
  assert(mismatchPaidAt === "f", "a mismatched order was marked paid");
  assert(stock === "5", `expected stock restored to 5, got ${stock}`);

  // 4. Unsigned and wrongly signed bodies.
  const unsignedBody = eventFor(mismatched.order, `evt_${randomUUID()}`, {
    amountCents: mismatched.order.totalCents,
  });
  const unsigned = await postWebhook(unsignedBody, { "content-type": "application/json" });
  const unsignedEvent = JSON.parse(unsignedBody).id;

  const wrongBody = eventFor(mismatched.order, `evt_${randomUUID()}`);
  const wrongTimestamp = Math.floor(Date.now() / 1_000);
  const wrongSecret = createHmac("sha256", "whsec_wrong")
    .update(`${wrongTimestamp}.${wrongBody}`)
    .digest("hex");
  const wronglySigned = await postWebhook(wrongBody, {
    "content-type": "application/json",
    "x-payments-signature": `t=${wrongTimestamp},v1=${wrongSecret}`,
  });
  const wrongEvent = JSON.parse(wrongBody).id;

  console.log(
    `[http] unsigned -> ${unsigned.status}; wrongly signed -> ${wronglySigned.status}; ` +
      `psql event rows = ${eventCount(unsignedEvent)} and ${eventCount(wrongEvent)}`,
  );
  assert(unsigned.status === 400 && wronglySigned.status === 400, "bad signatures were not rejected");
  assert(eventCount(unsignedEvent) === 0 && eventCount(wrongEvent) === 0, "a rejected body wrote an event");

  console.log(
    "\n[proof] correct amount -> PAID + replay no-op (1 event row); amount+1 -> REFUND_REQUIRED " +
      "with stock restored; unsigned/wrong signature -> 400 with no event row",
  );
}

try {
  await main();
} catch (error) {
  console.error(`[fail] ${error.message}`);
  process.exitCode = 1;
} finally {
  await closeFixtures();
}
