import { expect, test } from "@playwright/test";

test.describe("sign-up", () => {
  test("creates an account and lands on /account signed in", async ({ page }) => {
    // Unique per run; the suite also reseeds, but this keeps two runs in one
    // database from colliding on the unique email.
    const email = `ada-${Date.now()}-${Math.random()
      .toString(36)
      .slice(2, 8)}@example.test`;
    const password = "correct-horse-battery";

    await page.goto("/signup");
    await expect(
      page.getByRole("heading", { name: "Create account", level: 1 }),
    ).toBeVisible();

    await page.getByLabel("Name", { exact: true }).fill("Ada Lovelace");
    await page.getByLabel("Email", { exact: true }).fill(email);
    await page.getByLabel("Password", { exact: true }).fill(password);
    await page.getByLabel("Confirm password", { exact: true }).fill(password);
    await page.getByRole("button", { name: "Create account" }).click();

    await expect(page).toHaveURL(/\/account$/);
    await expect(
      page.getByRole("heading", { name: "Welcome back, Ada", level: 1 }),
    ).toBeVisible();
    await expect(page.getByText(email)).toBeVisible();

    // Signed in immediately: the account area is reachable without a second
    // trip through the sign-in form.
    await page
      .getByRole("navigation", { name: "Account" })
      .getByRole("link", { name: "Orders" })
      .click();
    await expect(page).toHaveURL(/\/account\/orders$/);
    await expect(page.getByText("You have not placed an order yet.")).toBeVisible();
  });
});
