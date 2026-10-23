import { expect, test } from "@playwright/test";

import { ADMIN_EMAIL, ADMIN_PASSWORD, signIn } from "./helpers";

test.describe("admin console", () => {
  test("an admin opens the paid order, marks it fulfilled and sees the status", async ({
    page,
  }) => {
    await page.goto("/signin");
    await signIn(page, ADMIN_EMAIL, ADMIN_PASSWORD, /\/admin$/);

    await expect(
      page.getByRole("heading", { name: "Dashboard", level: 1 }),
    ).toBeVisible();

    await page
      .getByRole("navigation", { name: "Admin" })
      .getByRole("link", { name: "Orders" })
      .click();
    await expect(page).toHaveURL(/\/admin\/orders$/);

    // KST-2601-0001 is the deterministic seeded PAID order.
    await page.getByRole("link", { name: "KST-2601-0001" }).click();
    await expect(page).toHaveURL(/\/admin\/orders\/KST-2601-0001$/);
    await expect(page.getByText("Paid", { exact: true }).first()).toBeVisible();

    await page.getByRole("button", { name: "Mark fulfilled" }).click();

    await expect(page).toHaveURL(/\?updated=FULFILLED$/);
    await expect(page.getByText("Status updated to Fulfilled.")).toBeVisible();
    await expect(
      page.getByText("Fulfilled", { exact: true }).first(),
    ).toBeVisible();

    // The change is persisted: a reload renders it from the database, and the
    // only legal move from FULFILLED (none) replaced the action button.
    await page.reload();
    await expect(page.getByText("Fulfilled", { exact: true }).first()).toBeVisible();
    await expect(
      page.getByRole("button", { name: "Mark fulfilled" }),
    ).toHaveCount(0);
    await expect(
      page.getByText("No admin actions for this status."),
    ).toBeVisible();
  });

  test("a customer is redirected away from the admin console", async ({ page }) => {
    await page.goto("/signin");
    await signIn(page, "demo@kestrel.test", "demo-password-123", /\/account$/);

    // Direct navigation is the hard case: the guard must refuse a document
    // request, not only the client-side redirect after sign-in.
    await page.goto("/admin");

    await expect(page).toHaveURL(/\/account$/);
    await expect(
      page.getByRole("heading", { name: /Welcome back/ }),
    ).toBeVisible();
  });
});
