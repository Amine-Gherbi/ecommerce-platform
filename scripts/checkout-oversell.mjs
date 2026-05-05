#!/usr/bin/env node
// DoD proof: twenty real HTTP checkouts against a variant with stock 5 must
// yield exactly five orders and stock 0.
//
//   BASE_URL=http://localhost:3200 node scripts/checkout-oversell.mjs
//
// The checkouts run concurrently with fetch, each under its own Auth.js
// session. psql then counts orders, stock and open reservations.

import {
  checkout,
  closeFixtures,
  createShopper,
  psql,
  seedProduct,
  signIn,
} from "./lib/demo-fixtures.mjs";

const baseUrl = process.env.BASE_URL ?? "http://localhost:3200";
const CONCURRENCY = 20;
const INITIAL_STOCK = 5;
const priceCents = 2_490;

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

async function main() {
  console.log(
    `[setup] seeding one variant (price ${priceCents}, stock ${INITIAL_STOCK}) and ${CONCURRENCY} shoppers`,
  );
  const { variantId } = await seedProduct({ priceCents, stock: INITIAL_STOCK });

  const shoppers = [];
  for (let index = 0; index < CONCURRENCY; index += 1) {
    shoppers.push(
      await createShopper({
        variantId,
        priceCents,
        stock: INITIAL_STOCK,
        emailPrefix: `oversell-${index}`,
      }),
    );
  }

  const cookies = [];
  for (const shopper of shoppers) {
    cookies.push(await signIn(baseUrl, shopper.email, shopper.password));
  }
  console.log(`[auth] ${cookies.length} independent sessions signed in`);

  const startedAt = Date.now();
  const results = await Promise.all(
    shoppers.map((shopper, index) => checkout(baseUrl, cookies[index], shopper)),
  );
  const elapsedMs = Date.now() - startedAt;

  const created = results.filter((result) => result.status === 201);
  const outOfStock = results.filter(
    (result) => result.status === 409 && result.body?.error === "OUT_OF_STOCK",
  );
  const other = results.filter(
    (result) => result.status !== 201 && result.status !== 409,
  );

  const statusCounts = {};
  for (const result of results) {
    const key =
      result.status === 409 ? `${result.status}:${result.body?.error ?? "UNKNOWN"}` : String(result.status);
    statusCounts[key] = (statusCounts[key] ?? 0) + 1;
  }
  console.log(
    `[http] ${CONCURRENCY} checkouts in ${elapsedMs} ms -> ${JSON.stringify(statusCounts)}`,
  );

  if (other.length > 0) {
    console.log(
      `[http] unexpected responses: ${other
        .map((result) => `${result.status}:${JSON.stringify(result.body)}`)
        .join(", ")}`,
    );
  }

  const orderCount = Number(
    psql(
      `SELECT count(DISTINCT o.id) FROM "Order" o ` +
        `JOIN "OrderItem" oi ON oi."orderId" = o.id ` +
        `WHERE oi."variantId" = '${variantId}'`,
    ),
  );
  const distinctNumbers = new Set(
    created.map((result) => result.body?.number).filter(Boolean),
  ).size;
  const stock = Number(
    psql(`SELECT stock FROM "Variant" WHERE id = '${variantId}'`),
  );
  const openReservations = Number(
    psql(
      `SELECT count(*) FROM "StockReservation" sr ` +
        `JOIN "Order" o ON o.id = sr."orderId" ` +
        `WHERE sr."variantId" = '${variantId}' AND sr."releasedAt" IS NULL ` +
        `AND o.status = 'PENDING'`,
    ),
  );

  console.log(`[psql] orders for variant = ${orderCount}`);
  console.log(`[psql] distinct order numbers in responses = ${distinctNumbers}`);
  console.log(`[psql] stock = ${stock}`);
  console.log(`[psql] open reservations = ${openReservations}`);

  assert(created.length === INITIAL_STOCK, `expected 5 creations, got ${created.length}`);
  assert(outOfStock.length === CONCURRENCY - INITIAL_STOCK, `expected 15 out_of_stock, got ${outOfStock.length}`);
  assert(other.length === 0, "some requests failed for an unexpected reason");
  assert(orderCount === INITIAL_STOCK, `psql says ${orderCount} orders, expected ${INITIAL_STOCK}`);
  assert(distinctNumbers === INITIAL_STOCK, `expected ${INITIAL_STOCK} distinct numbers, got ${distinctNumbers}`);
  assert(stock === 0, `psql says stock ${stock}, expected 0`);
  assert(
    openReservations === INITIAL_STOCK,
    `expected ${INITIAL_STOCK} open reservations, got ${openReservations}`,
  );

  console.log(
    `[proof] 20 concurrent HTTP checkouts on stock ${INITIAL_STOCK} -> ` +
      `${created.length}x201, ${outOfStock.length}x409 OUT_OF_STOCK, stock=${stock}, ` +
      `orders=${orderCount}, openReservations=${openReservations}`,
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
