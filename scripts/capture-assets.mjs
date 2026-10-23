#!/usr/bin/env node
/**
 * Writes the four portfolio shots and manifest.json for the hub.
 *
 *   npm run assets
 *
 * Output defaults to P:/portfolio/_shared/assets/ecommerce-platform and can be
 * overridden with ASSETS_DIR. Preconditions: the app is running (default
 * http://127.0.0.1:3000) against the development database, and both
 * docs/proof/concurrency-run.txt and docs/load/checkout.md exist.
 *
 * Idempotence: the database is reseeded with `--seed 42` before capture, every
 * file this script owns is overwritten, `generatedAt` comes from the last git
 * commit rather than the clock, and animations/caret are disabled. Running it
 * twice on the same commit produces the same manifest.
 */
import { execFileSync, execSync } from "node:child_process";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

import { chromium } from "@playwright/test";
import sharp from "sharp";

const ROOT = process.cwd();
const BASE_URL = process.env.ASSETS_BASE_URL ?? "http://127.0.0.1:3000";
const OUTPUT = path.resolve(
  process.env.ASSETS_DIR ?? "P:/portfolio/_shared/assets/ecommerce-platform",
);
const WIDTH = 2880;
const HEIGHT = 1800;

const DEMO = { email: "demo@alder.test", password: "demo-password-123" };
const ADMIN = { email: "admin@alder.test", password: "admin-password-123" };
const CAPTURE_PRODUCTS = ["alder-ceramic-mug", "harbor-crew-tee"];

function fail(message) {
  console.error(`[assets] FAIL ${message}`);
  process.exit(1);
}

async function fileText(relative) {
  try {
    return await readFile(path.join(ROOT, relative), "utf8");
  } catch {
    fail(`missing required artifact ${relative}`);
  }
}

function gitTimestamp() {
  return execFileSync(
    "git",
    ["log", "-1", "--format=%cI"],
    { cwd: ROOT, encoding: "utf8" },
  ).trim();
}

function htmlEscape(value) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");
}

function parseLoadMetric(markdown, percentile) {
  const pattern = new RegExp(
    `${percentile}[^\\d\\n]*([0-9]+(?:\\.[0-9]+)?)\\s*(ms|s)\\b`,
    "i",
  );
  const match = pattern.exec(markdown);
  if (match === null) {
    fail(`docs/load/checkout.md has no ${percentile} latency in ms or s`);
  }
  const value = Number(match[1]);
  return match[2].toLowerCase() === "s"
    ? String(Math.round(value * 1_000))
    : String(value);
}

async function signIn(page, credentials) {
  await page.goto(`${BASE_URL}/login`);
  await page.getByLabel("Email").fill(credentials.email);
  await page.getByLabel("Password").fill(credentials.password);
  await page.getByRole("button", { name: "Sign in" }).click();
  await page.waitForURL(`${BASE_URL}/`);
}

async function addFirstVariant(page, slug) {
  await page.goto(`${BASE_URL}/products/${slug}`);
  const button = page.getByRole("button", { name: "Add to cart" }).first();
  await button.waitFor();
  if (await button.isDisabled()) {
    fail(`variant for ${slug} is out of stock after seeding`);
  }
  await Promise.all([
    page.waitForResponse(
      (response) =>
        response.request().method() === "POST" &&
        new URL(response.url()).pathname === `/products/${slug}`,
    ),
    button.click(),
  ]);
}

async function capture(page, name) {
  const png = await page.screenshot({
    type: "png",
    animations: "disabled",
    caret: "hide",
  });
  const target = path.join(OUTPUT, name);
  await sharp(png).webp({ quality: 90 }).toFile(target);

  const metadata = await sharp(target).metadata();
  if (
    metadata.format !== "webp" ||
    metadata.width !== WIDTH ||
    metadata.height !== HEIGHT
  ) {
    fail(
      `${name} is ${String(metadata.width)}x${String(metadata.height)} ${String(metadata.format)}, expected ${WIDTH}x${HEIGHT} webp`,
    );
  }
  console.log(`[assets] wrote ${target} (${WIDTH}x${HEIGHT} webp)`);
}

function heroHtml(terminal) {
  const lines = terminal.trimEnd().split(/\r?\n/);
  // The tail keeps the assertion summary and the [proof] line in frame; the
  // command header is added for context.
  const shown = lines.slice(-34).join("\n");
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<style>
  html, body { margin: 0; height: 100%; background: #0b0f14; }
  * { box-sizing: border-box; }
  .wrap { display: grid; grid-template-columns: 44% 56%; height: 100vh; overflow: hidden; }
  .term {
    background: #0b0f14; color: #c9d6e4; padding: 26px 28px;
    border-right: 1px solid #223041; display: flex; flex-direction: column;
    font-family: ui-sans-serif, system-ui, sans-serif;
  }
  .term h1 { margin: 0; font-size: 18px; line-height: 1.3; color: #f8fafc; }
  .term p { margin: 6px 0 0; font-size: 12px; color: #7f93a8; }
  pre {
    flex: 1; margin: 16px 0 0; overflow: hidden; white-space: pre-wrap;
    font-family: ui-monospace, "Cascadia Mono", Consolas, monospace;
    font-size: 12px; line-height: 1.5; color: #b8c7d6;
  }
  .cmd { color: #7ee787; }
  .right { background: #ffffff; overflow: hidden; }
  iframe { width: 100%; height: 100%; border: 0; background: #ffffff; }
</style>
</head>
<body>
  <div class="wrap">
    <section class="term">
      <h1>20 concurrent checkouts on stock 5</h1>
      <p>tests/integration/checkout.oversell.test.ts — captured output</p>
      <pre><span class="cmd">$ npx vitest run tests/integration/checkout.oversell.test.ts --reporter=verbose</span>

${htmlEscape(shown)}</pre>
    </section>
    <section class="right">
      <iframe title="checkout" src="${BASE_URL}/checkout"></iframe>
    </section>
  </div>
</body>
</html>`;
}

async function main() {
  try {
    const response = await fetch(BASE_URL);
    if (!response.ok) {
      fail(`app at ${BASE_URL} answered ${response.status}`);
    }
  } catch (error) {
    fail(
      `app is not reachable at ${BASE_URL}; start it with 'npm run dev' (${String(error)})`,
    );
  }

  const terminal = await fileText("docs/proof/concurrency-run.txt");
  const loadReport = await fileText("docs/load/checkout.md");
  const p50 = parseLoadMetric(loadReport, "p50");
  const p95 = parseLoadMetric(loadReport, "p95");
  const p99 = parseLoadMetric(loadReport, "p99");
  const generatedAt = gitTimestamp();

  try {
    execSync("npx prisma db seed -- --seed 42", {
      cwd: ROOT,
      stdio: "inherit",
      env: process.env,
      timeout: 180_000,
    });
  } catch (error) {
    fail(`could not reseed the database (${String(error)})`);
  }

  await mkdir(OUTPUT, { recursive: true });

  const browser = await chromium.launch();

  try {
    const customerContext = await browser.newContext({
      viewport: { width: 1440, height: 900 },
      deviceScaleFactor: 2,
      colorScheme: "light",
      reducedMotion: "reduce",
    });
    const customer = await customerContext.newPage();

    await signIn(customer, DEMO);

    await customer.goto(`${BASE_URL}/`);
    await customer.getByRole("heading", { name: "Catalog" }).waitFor();
    await customer.locator("article").first().waitFor();
    await capture(customer, "shot-01.webp");

    for (const slug of CAPTURE_PRODUCTS) {
      await addFirstVariant(customer, slug);
    }
    await customer.goto(`${BASE_URL}/cart`);
    await customer.getByRole("heading", { name: "Cart" }).waitFor();
    await customer.getByText("Total", { exact: true }).waitFor();
    await capture(customer, "shot-02.webp");

    // Hero: real terminal output beside the checkout page, same browser
    // context so the iframe is signed in and first-party.
    await customer.goto(`${BASE_URL}/`);
    await customer.setContent(heroHtml(terminal));
    const checkoutFrame = customer.frameLocator('iframe[title="checkout"]');
    await checkoutFrame.getByTestId("checkout-total").waitFor();
    await capture(customer, "hero.webp");

    const adminContext = await browser.newContext({
      viewport: { width: 1440, height: 900 },
      deviceScaleFactor: 2,
      colorScheme: "light",
      reducedMotion: "reduce",
    });
    const admin = await adminContext.newPage();
    await signIn(admin, ADMIN);
    await admin.goto(`${BASE_URL}/admin/orders`);
    await admin.getByRole("heading", { name: "Orders" }).waitFor();
    await admin.getByText("REFUND_REQUIRED").first().waitFor();
    await capture(admin, "shot-03.webp");
  } finally {
    await browser.close();
  }

  const shots = [
    {
      file: "hero.webp",
      width: WIDTH,
      height: HEIGHT,
      alt: "Left: terminal output of 20 concurrent checkouts on stock 5 — five 201s, fifteen 409s, stock 0, five open reservations. Right: the signed-in checkout page showing the server-computed total.",
    },
    {
      file: "shot-01.webp",
      width: WIDTH,
      height: HEIGHT,
      alt: "Catalog grid of seeded products with category badges, descriptions and from-prices in integer cents.",
    },
    {
      file: "shot-02.webp",
      width: WIDTH,
      height: HEIGHT,
      alt: "Cart with two seeded variants, per-line prices, stock and a total recomputed by the server on every request.",
    },
    {
      file: "shot-03.webp",
      width: WIDTH,
      height: HEIGHT,
      alt: "Admin order console showing the order state machine and a seeded REFUND_REQUIRED order with its snapshotted line items.",
    },
  ];

  const manifest = {
    project: "ecommerce-platform",
    title: "Full-Stack E-Commerce Platform",
    oneLiner:
      "Server-validated checkout, reservation-based stock, idempotent webhooks.",
    stack: ["Next.js", "TypeScript", "PostgreSQL", "Stripe"],
    generatedAt,
    seeded: true,
    shots,
    proof: {
      measured: [
        {
          label: "Checkout latency, 50 concurrent virtual users",
          value: `p50 ${p50} ms · p95 ${p95} ms · p99 ${p99} ms`,
          method: `k6 load/checkout.js against localhost:3000 on this Windows 11 machine, ${new Date(generatedAt).toISOString().slice(0, 10)}, 50 VUs, 250 checkouts in a 1-minute run`,
          artifact: "docs/load/checkout.md",
        },
        {
          label: "Orders created by 20 concurrent checkouts on stock 5",
          value: "5 orders · 15 rejected · stock 0 · 5 open reservations",
          method:
            "npx vitest run tests/integration/checkout.oversell.test.ts, real Postgres on shop_test",
          artifact: "docs/proof/concurrency-run.txt",
        },
      ],
      invariants: [
        {
          claim: "A forged price in the checkout body cannot change the charge",
          test: "tests/integration/checkout.forged-price.test.ts",
        },
        {
          claim: "One order per (userId, idempotencyKey) under concurrent double submit",
          test: "tests/integration/checkout.double-submit.test.ts",
        },
        {
          claim: "20 concurrent checkouts on stock 5 create exactly 5 orders and stock never goes negative",
          test: "tests/integration/checkout.oversell.test.ts",
        },
        {
          claim: "An amount mismatch becomes REFUND_REQUIRED, never PAID",
          test: "tests/integration/checkout.amount-mismatch.test.ts",
        },
        {
          claim: "A replayed Stripe webhook is a 200 no-op",
          test: "tests/integration/webhook.replay.test.ts",
        },
        {
          claim: "Expired reservations release stock and cancel the order",
          test: "tests/integration/stock.sweeper.test.ts",
        },
        {
          claim: "A dropped webhook is settled by the reconciliation job",
          test: "tests/integration/reconcile.dropped-webhook.test.ts",
        },
      ],
      limits: [
        "Single-node PostgreSQL 16 on one Windows 11 machine; the load numbers do not transfer to a managed database or a shared runner.",
        "k6 ran for 1 minute with 250 checkouts instead of the planned 5 minutes, so the p99 is a 250-sample estimate.",
        "Payments are Stripe test mode at most; without a key the PaymentIntent is a local pi_local_* value and no card is charged.",
        "No partial refunds, tax engine, shipping rates or email delivery — the refund path is all-or-nothing.",
        "The cart is not cleared after checkout, and the demo does not model fulfilment beyond the admin status console.",
      ],
    },
  };

  const manifestPath = path.join(OUTPUT, "manifest.json");
  await writeFile(
    manifestPath,
    `${JSON.stringify(manifest, null, 2)}\n`,
    "utf8",
  );
  console.log(`[assets] wrote ${manifestPath}`);
}

await main();
