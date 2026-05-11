import { expect, test } from "@playwright/test";

import {
  DEMO_EMAIL,
  DEMO_PASSWORD,
  parsePrice,
  readSummaryAmount,
  signIn,
} from "./helpers";

// The full customer path through the real server: category → product → cart →
// sign-in (which merges the anonymous cart) → checkout → confirmation.
test.describe("checkout", () => {
  test("browse, add to cart, sign in and place an order at the server total", async ({
    page,
  }) => {
    await page.goto("/c/headphones");
    await expect(
      page.getByRole("heading", { name: "Headphones", level: 1 }),
    ).toBeVisible();

    await page
      .getByRole("link", { name: /Sony WH-CH510/ })
      .first()
      .click();
    await expect(page).toHaveURL(/\/p\/sony-wh-ch510$/);
    await expect(
      page.getByRole("heading", { name: "Sony WH-CH510", level: 1 }),
    ).toBeVisible();
    await expect(page.getByText("In stock")).toBeVisible();

    await page.getByRole("button", { name: "Add to cart" }).click();
    await expect(page.getByText("Added to cart.")).toBeVisible();
    await page.getByRole("link", { name: "View cart" }).click();
    await expect(page).toHaveURL(/\/cart$/);

    const cartSubtotal = await readSummaryAmount(page, "Subtotal");
    const cartShipping = await readSummaryAmount(page, "Shipping");
    const cartTotal = await readSummaryAmount(page, "Total");

    // Sony WH-CH510 is €59.00: below the €80 free-shipping threshold, so the
    // server charges the €4.90 standard rate.
    expect(cartSubtotal).toBe(parsePrice("€59.00"));
    expect(cartShipping).toBe(parsePrice("€4.90"));
    expect(cartTotal).toBe(cartSubtotal + cartShipping);

    await page.getByRole("link", { name: "Continue to checkout" }).click();
    await expect(page).toHaveURL(/\/signin\?next=\/checkout$/);

    await signIn(page, DEMO_EMAIL, DEMO_PASSWORD, /\/checkout$/);
    await expect(
      page.getByRole("heading", { name: "Checkout", level: 1 }),
    ).toBeVisible();
    // The merged cart survived the sign-in, and the seeded address is selected.
    await expect(page.getByText("Sony WH-CH510").first()).toBeVisible();
    await expect(page.getByRole("radio", { name: /Home/ })).toBeChecked();

    const [response] = await Promise.all([
      page.waitForResponse(
        (candidate) =>
          new URL(candidate.url()).pathname === "/api/checkout" &&
          candidate.request().method() === "POST",
      ),
      page.getByRole("button", { name: "Place order" }).click(),
    ]);

    expect(response.status()).toBe(201);
    const body = (await response.json()) as {
      number?: unknown;
      status?: unknown;
      totalCents?: unknown;
      paymentIntentId?: unknown;
      clientSecret?: unknown;
    };
    expect(body.status).toBe("PENDING");
    expect(body.number).toMatch(/^KST-\d{4}-[0-9A-F]{8}$/);
    // The order is bound to the intent the server created, not a local id.
    expect(body.paymentIntentId).toMatch(/^pi_/);
    expect(body.clientSecret).toEqual(expect.any(String));

    // The E2E server has no publishable key, so Stripe.js is not loaded and
    // the page stops at the order-created state. The order and its totals come
    // from the real transaction.
    const orderNumber = String(body.number);
    await expect(
      page.getByRole("heading", { name: `Pay for ${orderNumber}` }),
    ).toBeVisible();
    await page.getByRole("link", { name: "View the order" }).click();

    await expect(page).toHaveURL(/\/orders\/KST-/);
    await expect(page.getByText("Order confirmation")).toBeVisible();

    const subtotal = await readSummaryAmount(page, "Subtotal");
    const shipping = await readSummaryAmount(page, /^Shipping/);
    const total = await readSummaryAmount(page, "Total");

    expect(subtotal).toBe(cartSubtotal);
    expect(shipping).toBe(cartShipping);
    expect(total).toBe(subtotal + shipping);
    expect(total).toBe(cartTotal);
    // The confirmation total is the one the server wrote to the order.
    expect(body.totalCents).toBe(total);
  });
});
