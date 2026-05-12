import { expect, type Page, test } from "@playwright/test";

import { DEMO_EMAIL, DEMO_PASSWORD, signIn } from "./helpers";

// The six storefront routes the DOM audit inspected. Checkout needs a session,
// so the walk below signs in; it does not need a basket to render its shell.
const ROUTES = [
  "/",
  "/c/headphones",
  "/p/technics-sl-120",
  "/cart",
  "/checkout",
  "/signin",
] as const;

async function visibleHeadingLevels(page: Page): Promise<number[]> {
  return page.evaluate(() =>
    Array.from(document.querySelectorAll("h1, h2, h3, h4, h5, h6"))
      .filter((element) => {
        const style = getComputedStyle(element);
        const rect = element.getBoundingClientRect();
        return (
          style.display !== "none" &&
          style.visibility !== "hidden" &&
          rect.width > 0 &&
          rect.height > 0
        );
      })
      .map((element) => Number(element.tagName.slice(1))),
  );
}

function expectNoSkippedLevels(levels: number[], label: string): void {
  expect(levels[0], `${label}: first visible heading`).toBe(1);
  for (let index = 1; index < levels.length; index += 1) {
    const previous = levels[index - 1]!;
    const current = levels[index]!;
    expect(
      current,
      `${label}: h${previous} is followed by h${current}`,
    ).toBeLessThanOrEqual(previous + 1);
  }
  // The category results must still sit under an h2 with h3 cards beneath it.
  expect(levels, `${label}: outline reaches h3`).toContain(3);
}

test.describe("store accessibility", () => {
  test("every store route exposes a keyboard skip link into the main region", async ({
    page,
  }) => {
    // Checkout requires a session; it renders its empty state without a cart,
    // so this test never mutates the demo user's basket for later specs.
    await page.goto("/signin");
    await signIn(page, DEMO_EMAIL, DEMO_PASSWORD, /\/account$/);

    for (const path of ROUTES) {
      await page.goto(path);
      if (path === "/checkout") {
        await expect(page).toHaveURL(/\/checkout$/);
      }

      const skipLink = page.locator('a[href="#main"]');
      await expect(skipLink, path).toHaveCount(1);
      await expect(skipLink, path).toHaveText("Skip to content");

      const main = page.locator("main#main");
      await expect(main, path).toHaveCount(1);

      // The skip link must precede every other focusable control in the DOM.
      const isFirstFocusable = await page.evaluate(() => {
        const selector =
          'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';
        const first = Array.from(
          document.querySelectorAll<HTMLElement>(selector),
        ).find((element) => {
          const style = getComputedStyle(element);
          return (
            !element.closest('[aria-hidden="true"]') &&
            style.display !== "none" &&
            style.visibility !== "hidden"
          );
        });
        return first === document.querySelector('a[href="#main"]');
      });
      expect(isFirstFocusable, `${path}: skip link is first focusable`).toBe(
        true,
      );

      // At rest the link is parked outside the viewport.
      const atRest = await skipLink.evaluate((element) => {
        const rect = element.getBoundingClientRect();
        return { top: rect.top, bottom: rect.bottom };
      });
      expect(atRest.bottom, `${path}: hidden at rest`).toBeLessThanOrEqual(0);

      const layoutAtRest = await page.evaluate(() => {
        const mainRect = document
          .querySelector("main#main")!
          .getBoundingClientRect();
        const headerRect = document
          .querySelector("header")!
          .getBoundingClientRect();
        return {
          mainTop: mainRect.top,
          mainLeft: mainRect.left,
          mainWidth: mainRect.width,
          headerBottom: headerRect.bottom,
          scrollHeight: document.documentElement.scrollHeight,
        };
      });

      // Tab once focuses the skip link; it must be on screen while focused.
      await page.keyboard.press("Tab");
      await expect(skipLink, `${path}: first Tab focuses skip link`).toBeFocused();

      // The reveal is a transition; poll until the fixed link has settled.
      await expect
        .poll(
          async () =>
            skipLink.evaluate((element) => element.getBoundingClientRect().top),
          { message: `${path}: visible on focus` },
        )
        .toBeGreaterThanOrEqual(0);

      const focused = await skipLink.evaluate((element) => {
        const rect = element.getBoundingClientRect();
        return { bottom: rect.bottom, viewport: window.innerHeight };
      });
      expect(focused.bottom, `${path}: fits on screen`).toBeLessThanOrEqual(
        focused.viewport,
      );

      // Revealing it is fixed-position, so the document must not move.
      const layoutAfterFocus = await page.evaluate(() => {
        const mainRect = document
          .querySelector("main#main")!
          .getBoundingClientRect();
        const headerRect = document
          .querySelector("header")!
          .getBoundingClientRect();
        return {
          mainTop: mainRect.top,
          mainLeft: mainRect.left,
          mainWidth: mainRect.width,
          headerBottom: headerRect.bottom,
          scrollHeight: document.documentElement.scrollHeight,
        };
      });
      expect(layoutAfterFocus, `${path}: focusing the link shifts no layout`).toEqual(
        layoutAtRest,
      );

      // Enter moves keyboard focus to the main region itself.
      await page.keyboard.press("Enter");
      await expect(main, `${path}: Enter focuses main`).toBeFocused();
    }
  });

  test("the category page has a complete heading outline at desktop and mobile", async ({
    page,
  }) => {
    for (const width of [1440, 390]) {
      await page.setViewportSize({ width, height: 900 });
      await page.goto("/c/headphones");

      const levels = await visibleHeadingLevels(page);
      expectNoSkippedLevels(levels, `/c/headphones at ${width}px`);
    }
  });
});
