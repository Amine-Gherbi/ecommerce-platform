import { expect, type Page } from "@playwright/test";

export const DEMO_EMAIL = "demo@alder.test";
export const DEMO_PASSWORD = "demo-password-123";

/** Signs in through the real form (POST /login → /api/login → 303). */
export async function signIn(page: Page): Promise<void> {
  await page.goto("/login");
  await page.getByLabel("Email").fill(DEMO_EMAIL);
  await page.getByLabel("Password").fill(DEMO_PASSWORD);
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page).toHaveURL(/\/$/);
  await expect(page.getByRole("heading", { name: "Catalog" })).toBeVisible();
}

/**
 * Adds one unit of a seeded variant through the server action and waits for the
 * action's POST to finish before navigating away.
 */
export async function addOneToCart(page: Page, slug: string): Promise<void> {
  await page.goto(`/products/${slug}`);
  const addButton = page
    .getByRole("button", { name: "Add to cart" })
    .first();
  await expect(addButton).toBeEnabled();

  await Promise.all([
    page.waitForResponse(
      (response) =>
        response.request().method() === "POST" &&
        new URL(response.url()).pathname === `/products/${slug}`,
    ),
    addButton.click(),
  ]);
}

export interface CheckoutPageState {
  totalCents: number;
  cartVersion: string;
}

/** Reads the server-rendered total and the cart version the client is shown. */
export async function readCheckoutState(page: Page): Promise<CheckoutPageState> {
  await page.goto("/checkout");
  const total = page.getByTestId("checkout-total");
  await expect(total).toBeVisible();

  const totalCents = Number(await total.getAttribute("data-total-cents"));
  const cartVersion = await total.getAttribute("data-cart-version");
  if (!Number.isSafeInteger(totalCents) || totalCents <= 0) {
    throw new Error(`checkout total missing or non-positive: ${String(totalCents)}`);
  }
  if (cartVersion === null || !/^[0-9a-f]{64}$/.test(cartVersion)) {
    throw new Error("checkout page did not expose a sha256 cart version");
  }
  return { totalCents, cartVersion };
}
