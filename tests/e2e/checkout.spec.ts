import { expect, test } from "@playwright/test";

import {
  addOneToCart,
  readCheckoutState,
  signIn,
} from "./helpers";

// One happy path and one adversarial path, both through the real server.
//
// The happy path signs in with the seeded customer, adds a seeded variant and
// places the order on the checkout page. The adversarial path sends the same
// request with a forged `totalCents` and `unitPriceCents` in the body; the
// response must carry the database-computed total, not the forged one.

test.describe("checkout", () => {
  test("a signed-in customer places an order at the server-computed total", async ({
    page,
  }) => {
    await signIn(page);
    await addOneToCart(page, "alder-ceramic-mug");
    const { totalCents } = await readCheckoutState(page);

    const responsePromise = page.waitForResponse(
      (response) =>
        response.request().method() === "POST" &&
        new URL(response.url()).pathname === "/api/checkout",
    );
    await page.getByTestId("checkout-submit").click();
    const response = await responsePromise;

    expect(response.status()).toBe(201);
    const body = (await response.json()) as {
      orderId: string;
      status: string;
      totalCents: number;
      created: boolean;
    };
    expect(body.status).toBe("PENDING");
    expect(body.created).toBe(true);
    expect(body.totalCents).toBe(totalCents);
    expect(body.orderId).toMatch(/^[0-9a-f-]{36}$/);

    const result = page.getByTestId("checkout-result");
    await expect(result).toContainText(body.orderId);
    await expect(result).toContainText("PENDING");
  });

  test("a forged price in the request body is ignored", async ({ page }) => {
    await signIn(page);
    await addOneToCart(page, "alder-ceramic-mug");
    const { totalCents, cartVersion } = await readCheckoutState(page);

    const response = await page.request.post("/api/checkout", {
      data: {
        addressId: "attacker-address",
        cartVersion,
        // Everything below is what a tampering client would send. None of it
        // is read by `parseCheckoutBody`.
        totalCents: 1,
        subtotalCents: 1,
        unitPriceCents: 1,
        items: [{ variantId: "forged", quantity: 999 }],
      },
      headers: { origin: "http://127.0.0.1:3100" },
    });

    expect(response.status()).toBe(201);
    const body = (await response.json()) as {
      status: string;
      totalCents: number;
      subtotalCents: number;
    };
    expect(body.status).toBe("PENDING");
    expect(body.totalCents).toBe(totalCents);
    expect(body.totalCents).not.toBe(1);
    expect(body.subtotalCents).toBe(totalCents);
  });
});
