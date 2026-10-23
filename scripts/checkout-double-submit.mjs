#!/usr/bin/env node
// DoD proof: server-computed totals, a forged price being ignored, and two
// concurrent submits of one cart version creating one order.
//
//   BASE_URL=http://localhost:3200 node scripts/checkout-double-submit.mjs
//
// The two submits are real parallel `curl` processes sharing one Auth.js
// cookie jar. Verification is a psql query, printed with its result.

import { spawn } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import {
  FREE_SHIPPING_THRESHOLD_CENTS,
  SHIPPING_CENTS,
  closeFixtures,
  createShopper,
  psql,
} from "./lib/demo-fixtures.mjs";

const baseUrl = process.env.BASE_URL ?? "http://localhost:3200";
const priceCents = 2_490;
const expectedSubtotal = priceCents;
const expectedShipping = expectedSubtotal >= FREE_SHIPPING_THRESHOLD_CENTS ? 0 : SHIPPING_CENTS;
const expectedTotal = expectedSubtotal + expectedShipping;

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "checkout-proof-"));
const jar = path.join(tmp, "cookies.txt");
const callbackOut = path.join(tmp, "callback.html");

function curl(args) {
  return new Promise((resolve, reject) => {
    const child = spawn("curl", args, { windowsHide: true });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (chunk) => {
      stdout += chunk;
    });
    child.stderr.on("data", (chunk) => {
      stderr += chunk;
    });
    child.on("error", reject);
    child.on("close", (code) => {
      if (code === 0) {
        resolve(stdout);
      } else {
        reject(new Error(`curl exited ${code}: ${stderr.trim()}`));
      }
    });
  });
}

async function curlSignIn(shopper) {
  const csrf = JSON.parse(
    await curl(["-s", "-c", jar, `${baseUrl}/api/auth/csrf`]),
  );
  const status = (
    await curl([
      "-s",
      "-o",
      callbackOut,
      "-w",
      "%{http_code}",
      "-b",
      jar,
      "-c",
      jar,
      "-X",
      "POST",
      "-H",
      "content-type: application/x-www-form-urlencoded",
      "-H",
      `origin: ${baseUrl}`,
      "--data-urlencode",
      `csrfToken=${csrf.csrfToken}`,
      "--data-urlencode",
      `email=${shopper.email}`,
      "--data-urlencode",
      `password=${shopper.password}`,
      "--data-urlencode",
      `callbackUrl=${baseUrl}/account`,
      `${baseUrl}/api/auth/callback/credentials`,
    ])
  ).trim();

  const cookies = fs.readFileSync(jar, "utf8");
  if (!cookies.includes("authjs.session-token")) {
    throw new Error(`curl sign-in failed: HTTP ${status}, no session cookie`);
  }
  console.log(`[auth] curl signed in ${shopper.email} (callback HTTP ${status})`);
}

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

async function scenarioServerPricing() {
  console.log("\n=== Scenario 1: server-computed total, forged totalCents ignored ===");
  const shopper = await createShopper({ priceCents, stock: 10 });
  await curlSignIn(shopper);

  const payload = JSON.stringify({
    addressId: shopper.addressId,
    cartVersion: shopper.cartVersion,
    totalCents: 1,
    subtotalCents: 1,
    shippingCents: 0,
  });
  const raw = await curl([
    "-s",
    "-w",
    "\n%{http_code}",
    "-b",
    jar,
    "-X",
    "POST",
    "-H",
    "content-type: application/json",
    "--data",
    payload,
    `${baseUrl}/api/checkout`,
  ]);
  const newline = raw.lastIndexOf("\n");
  const status = Number(raw.slice(newline + 1).trim());
  const body = JSON.parse(raw.slice(0, newline));

  console.log(`[http] POST /api/checkout with totalCents: 1 -> ${status}`);
  console.log(
    `[http] number=${body.number} totalCents=${body.totalCents} subtotalCents=${body.subtotalCents} shippingCents=${body.shippingCents}`,
  );

  assert(status === 201, `expected 201, got ${status}`);
  assert(
    body.subtotalCents === expectedSubtotal,
    `subtotal ${body.subtotalCents} != ${expectedSubtotal}`,
  );
  assert(
    body.shippingCents === expectedShipping,
    `shipping ${body.shippingCents} != ${expectedShipping}`,
  );
  assert(body.totalCents === expectedTotal, `total ${body.totalCents} != ${expectedTotal}`);
  assert(body.totalCents !== 1, "forged totalCents was used");

  const psqlRow = psql(
    `SELECT o."number", o."subtotalCents", o."shippingCents", o."totalCents", ` +
      `SUM(oi."unitPriceCents" * oi.quantity)::int AS recomputed_subtotal, ` +
      `(CASE WHEN SUM(oi."unitPriceCents" * oi.quantity) >= ${FREE_SHIPPING_THRESHOLD_CENTS} ` +
      `THEN 0 ELSE ${SHIPPING_CENTS} END)::int AS recomputed_shipping ` +
      `FROM "Order" o JOIN "OrderItem" oi ON oi."orderId" = o.id ` +
      `WHERE o."number" = '${body.number}' GROUP BY o.id`,
  );
  const [number, subtotal, shipping, total, recomputedSubtotal, recomputedShipping] =
    psqlRow.split("|");

  console.log(`[psql] ${psqlRow}`);
  console.log(
    `[psql] number=${number} subtotal=${subtotal} shipping=${shipping} total=${total} ` +
      `recomputed_subtotal=${recomputedSubtotal} recomputed_shipping=${recomputedShipping}`,
  );

  assert(number === body.number, "psql found the wrong order");
  assert(Number(subtotal) === Number(recomputedSubtotal), "order subtotal != Variant prices");
  assert(Number(shipping) === Number(recomputedShipping), "order shipping != shipping rule");
  assert(
    Number(total) === Number(subtotal) + Number(shipping),
    "order total != subtotal + shipping",
  );
  assert(Number(total) === expectedTotal, "psql total is not the server-computed total");
  console.log(
    `[proof] forged totalCents:1 ignored; order ${body.number} stored ${total} = ${subtotal} + ${shipping}, matching Variant.priceCents in psql`,
  );
}

async function scenarioDoubleSubmit() {
  console.log("\n=== Scenario 2: two parallel curl submits, one cart version ===");
  const shopper = await createShopper({ priceCents, stock: 10 });
  await curlSignIn(shopper);

  const payload = JSON.stringify({
    addressId: shopper.addressId,
    cartVersion: shopper.cartVersion,
  });

  const call = () =>
    curl([
      "-s",
      "-w",
      "\n%{http_code}",
      "-b",
      jar,
      "-X",
      "POST",
      "-H",
      "content-type: application/json",
      "--data",
      payload,
      `${baseUrl}/api/checkout`,
    ]);

  const [first, second] = await Promise.all([call(), call()]);
  const results = [first, second].map((raw) => {
    const newline = raw.lastIndexOf("\n");
    return {
      status: Number(raw.slice(newline + 1).trim()),
      body: JSON.parse(raw.slice(0, newline)),
    };
  });

  for (const [index, result] of results.entries()) {
    console.log(
      `[curl ${index + 1}] HTTP ${result.status} number=${result.body.number} totalCents=${result.body.totalCents}`,
    );
  }

  const statuses = results.map((result) => result.status).sort((a, b) => a - b);
  assert(
    statuses[0] === 200 && statuses[1] === 201,
    `expected one 201 and one 200, got ${statuses.join(", ")}`,
  );
  assert(
    results[0].body.number === results[1].body.number,
    "the two submits returned different orders",
  );
  assert(
    results[0].body.totalCents === expectedTotal,
    "the duplicate did not return the stored total",
  );

  const orderCount = psql(
    `SELECT count(*) FROM "Order" WHERE "idempotencyKey" = '${shopper.idempotencyKey}'`,
  );
  const userOrderCount = psql(
    `SELECT count(*) FROM "Order" WHERE "userId" = '${shopper.userId}'`,
  );
  console.log(
    `[psql] count(orders WHERE idempotencyKey = sha256(cart.id:cartVersion)) = ${orderCount}`,
  );
  console.log(`[psql] count(orders WHERE userId = shopper) = ${userOrderCount}`);

  assert(Number(orderCount) === 1, `expected 1 order, psql says ${orderCount}`);
  assert(Number(userOrderCount) === 1, `expected 1 user order, psql says ${userOrderCount}`);
  console.log(
    `[proof] two concurrent curls on one cart version -> one order (${results[0].body.number}), psql count = ${orderCount}`,
  );
}

try {
  scenarioServerPricing().then(scenarioDoubleSubmit).then(
    async () => {
      await closeFixtures();
      fs.rmSync(tmp, { recursive: true, force: true });
      console.log("\n[proof] double-submit script finished with every assertion passing");
    },
    async (error) => {
      await closeFixtures();
      fs.rmSync(tmp, { recursive: true, force: true });
      console.error(`\n[fail] ${error.message}`);
      process.exitCode = 1;
    },
  );
} catch (error) {
  console.error(error);
  process.exitCode = 1;
}
