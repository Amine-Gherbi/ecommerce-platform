import { expect, test } from "@playwright/test";

import { DEMO_EMAIL } from "./helpers";

test.describe("sign-in", () => {
  test("a wrong password shows the error and stays on the page", async ({
    page,
  }) => {
    await page.goto("/signin");
    await page.getByLabel("Email", { exact: true }).fill(DEMO_EMAIL);
    await page.getByLabel("Password", { exact: true }).fill("not-the-password");
    await page.getByRole("button", { name: "Sign in" }).click();

    // Next's route announcer is also `role="alert"`; scope to the message.
    await expect(
      page.getByRole("alert").filter({ hasText: "Email or password is incorrect." }),
    ).toBeVisible();
    await expect(page).toHaveURL(/\/signin$/);

    // The form keeps what the customer typed so a typo can be corrected.
    await expect(page.getByLabel("Email", { exact: true })).toHaveValue(
      DEMO_EMAIL,
    );
    await expect(page.getByLabel("Password", { exact: true })).toHaveValue(
      "not-the-password",
    );
  });
});
