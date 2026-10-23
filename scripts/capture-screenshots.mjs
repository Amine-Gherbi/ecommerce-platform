// Captures the hub screenshots at 1440x900 CSS px / 2880x1800 device px.
// Usage: node scripts/capture-screenshots.mjs [outputDir]
// The dev server must be running on port 3000 against the seeded shop_dev DB.
/* global clearTimeout, document */
import { mkdir } from "node:fs/promises";
import path from "node:path";

import { chromium } from "@playwright/test";
import sharp from "sharp";

const BASE_URL = process.env.CAPTURE_BASE_URL ?? "http://127.0.0.1:3000";
const OUT_DIR = path.resolve(
  process.argv[2] ?? "../_shared/assets/ecommerce-platform",
);
const VIEWPORT = { width: 1440, height: 900 };
const SCALE = 2;

const DEMO = { email: "demo@kestrel.test", password: "demo-password-123" };
const ADMIN = { email: "admin@kestrel.test", password: "admin-password-123" };

async function settle(page) {
  await page.waitForLoadState("domcontentloaded");
  await page.evaluate(async () => {
    // Only visible images: the cart keeps a display:none mobile list and a
    // table in the DOM, and lazy images in the hidden branch never load.
    const visible = Array.from(document.images).filter(
      (image) => image.offsetParent !== null,
    );
    await Promise.all(
      visible
        .filter((image) => !image.complete)
        .map(
          (image) =>
            new Promise((resolve) => {
              const timer = setTimeout(resolve, 3_000);
              image.addEventListener(
                "load",
                () => {
                  clearTimeout(timer);
                  resolve();
                },
                { once: true },
              );
              image.addEventListener(
                "error",
                () => {
                  clearTimeout(timer);
                  resolve();
                },
                { once: true },
              );
            }),
        ),
    );
  });
  await page.waitForTimeout(150);
}

async function signIn(page, account) {
  await page.goto(`${BASE_URL}/signin`, { waitUntil: "domcontentloaded" });
  await page.getByLabel("Email", { exact: true }).fill(account.email);
  await page.getByLabel("Password", { exact: true }).fill(account.password);
  await page.getByRole("button", { name: "Sign in" }).click();
  await page.waitForURL((url) => !url.pathname.startsWith("/signin"), {
    timeout: 30_000,
  });
}

async function addToCart(page, slug, quantity = 1) {
  await page.goto(`${BASE_URL}/p/${slug}`, { waitUntil: "domcontentloaded" });
  await settle(page);
  // Dev-mode hydration can land after the first paint; a click before React
  // attaches does nothing. Watch for the server-action POST after each click
  // and retry once if the first click was swallowed.
  await page.waitForTimeout(1_000);
  if (quantity > 1) {
    await page.getByLabel("Quantity").selectOption(String(quantity));
  }
  for (let attempt = 0; attempt < 2; attempt += 1) {
    const posted = page
      .waitForResponse(
        (response) =>
          response.request().method() === "POST" &&
          response.url().includes(`/p/${slug}`),
        { timeout: 10_000 },
      )
      .catch(() => null);
    await page.getByRole("button", { name: "Add to cart" }).click();
    if ((await posted) !== null) {
      return;
    }
  }
  throw new Error(`could not add ${slug} to the cart`);
}

async function save(page, file) {
  const pngPath = path.join(OUT_DIR, `${file}.png`);
  const webpPath = path.join(OUT_DIR, `${file}.webp`);
  await page.screenshot({ path: pngPath, type: "png", fullPage: false });
  // Quality 100 with a low compression effort keeps the full-resolution detail
  // the hub expects without spending minutes per shot.
  await sharp(pngPath)
    .resize(VIEWPORT.width * SCALE, VIEWPORT.height * SCALE)
    .webp({ quality: 100, effort: 0 })
    .toFile(webpPath);
  console.log(`saved ${webpPath}`);
}

async function main() {
  await mkdir(OUT_DIR, { recursive: true });

  const browser = await chromium.launch();

  const demoContext = await browser.newContext({
    viewport: VIEWPORT,
    deviceScaleFactor: SCALE,
  });
  const demoPage = await demoContext.newPage();
  demoPage.on("console", (message) => {
    if (message.type() === "error") {
      console.log(`[demo console] ${message.text()}`);
    }
  });

  await signIn(demoPage, DEMO);

  await demoPage.goto(`${BASE_URL}/p/technics-sl-1200-mk5`, {
    waitUntil: "domcontentloaded",
  });
  await settle(demoPage);
  await save(demoPage, "hero");

  await demoPage.goto(`${BASE_URL}/c/headphones`, {
    waitUntil: "domcontentloaded",
  });
  await settle(demoPage);
  await save(demoPage, "shot-01");

  // One line at quantity 2 (minus enabled) and one at 1 (minus disabled).
  await addToCart(demoPage, "technics-sl-1200-mk5", 2);
  await addToCart(demoPage, "sennheiser-hd-598");
  await demoPage.goto(`${BASE_URL}/cart`, { waitUntil: "domcontentloaded" });
  await settle(demoPage);
  // The header count is fetched separately; wait for it before the shot.
  await demoPage
    .waitForFunction(
      () =>
        document
          .querySelector('a[aria-label^="Cart,"]')
          ?.textContent?.includes("3") === true,
      null,
      { timeout: 10_000 },
    )
    .catch(() => {});
  await save(demoPage, "shot-02");

  const adminContext = await browser.newContext({
    viewport: VIEWPORT,
    deviceScaleFactor: SCALE,
  });
  const adminPage = await adminContext.newPage();
  adminPage.on("console", (message) => {
    if (message.type() === "error") {
      console.log(`[admin console] ${message.text()}`);
    }
  });
  await signIn(adminPage, ADMIN);
  await adminPage.goto(`${BASE_URL}/admin/orders`, {
    waitUntil: "domcontentloaded",
  });
  await settle(adminPage);
  await save(adminPage, "shot-03");

  await browser.close();
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
