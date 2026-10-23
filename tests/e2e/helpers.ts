import { expect, type Page } from "@playwright/test";

export const DEMO_EMAIL = "demo@kestrel.test";
export const DEMO_PASSWORD = "demo-password-123";
export const ADMIN_EMAIL = "admin@kestrel.test";
export const ADMIN_PASSWORD = "admin-password-123";

/**
 * Signs in through the real form and waits for the redirect the action owes
 * the caller. No fixed sleeps: the URL assertion polls.
 */
export async function signIn(
  page: Page,
  email: string,
  password: string,
  expectedUrl: RegExp,
): Promise<void> {
  await page.getByLabel("Email", { exact: true }).fill(email);
  await page.getByLabel("Password", { exact: true }).fill(password);
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page).toHaveURL(expectedUrl);
}

/** "€59.00" → 5900. Formatting is `Intl` en-IE; the value is integer cents. */
export function parsePrice(text: string): number {
  const match = /(\d+)[.,](\d{2})/.exec(text);
  if (match === null) {
    throw new Error(`not a price: ${JSON.stringify(text)}`);
  }
  return Number(match[1]) * 100 + Number(match[2]);
}

/**
 * Reads one amount from the server-rendered summary: `dt` → `dd` on the order
 * pages, `span` → `span` for the cart/checkout total row. In both shapes the
 * amount is the label's next sibling, so the label is the anchor. "Free" is 0;
 * the shipping label carries the delivery method on some pages, so a prefix
 * match is used for it.
 */
export async function readSummaryAmount(
  page: Page,
  label: string | RegExp,
): Promise<number> {
  // Anchored so "Subtotal" never answers a lookup for "Total", and matching on
  // `dt`/`span` only skips the items table's "Total" column header.
  const matcher =
    typeof label === "string"
      ? new RegExp(`^${label.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}$`)
      : new RegExp(`^(?:${label.source})`);

  const labelNode = page
    .locator("dt, span")
    .filter({ hasText: matcher })
    .first();

  await expect(labelNode).toBeVisible();
  const text = (
    await labelNode.locator("xpath=following-sibling::*[1]").innerText()
  ).trim();
  return text === "Free" ? 0 : parsePrice(text);
}
