import { execSync } from "node:child_process";

import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { listProducts } from "@/lib/catalog";
import { parseCatalogParams } from "@/lib/catalog-params";
import { db } from "@/lib/db";

function run(command: string): void {
  try {
    execSync(command, {
      cwd: process.cwd(),
      env: process.env,
      stdio: "pipe",
      timeout: 110_000,
    });
  } catch (error: unknown) {
    const stderr =
      typeof error === "object" && error !== null && "stderr" in error
        ? String((error as { stderr?: unknown }).stderr ?? "")
        : "";
    throw new Error(`Command failed: ${command}\n${stderr}`);
  }
}

// Migrate + deterministic seed the test database. `tests/setup-env.ts` has
// already pointed DATABASE_URL at shop_test before this module was imported.
beforeAll(() => {
  run("npx --no-install prisma migrate deploy");
  run("node --import tsx prisma/seed.ts --seed 42");
}, 120_000);

afterAll(async () => {
  await db.$disconnect();
});

describe("catalog search against the seeded database", () => {
  it("orders full-text matches by ts_rank_cd, not recency", async () => {
    const result = await listProducts(parseCatalogParams({ q: "canvas" }));

    expect(result.total).toBe(5);

    // Three products carry "canvas" in the *name* and rank 0.2; two mention it
    // only in the description and rank 0.1. The two description-only products
    // are newer (seed index 22-23), so a recency sort would put them first.
    expect(result.products.map((product) => product.slug)).toEqual([
      "alder-canvas-backpack",
      "bayside-canvas-sneaker",
      "alder-canvas-jacket",
      "harbor-weekender-duffel",
      "grove-tote-bag",
    ]);

    for (const product of result.products) {
      expect(product.rank).toBeGreaterThan(0);
    }

    for (let index = 1; index < result.products.length; index += 1) {
      const previous = result.products[index - 1];
      const current = result.products[index];
      if (previous !== undefined && current !== undefined) {
        expect(current.rank).toBeLessThanOrEqual(previous.rank);
      }
    }
  });

  it("applies category, price and pagination inside SQL", async () => {
    const apparel = await listProducts(
      parseCatalogParams({ category: "apparel" }),
    );
    expect(apparel.total).toBe(8);
    expect(apparel.products).toHaveLength(8);
    for (const product of apparel.products) {
      expect(product.categorySlug).toBe("apparel");
    }

    const priced = await listProducts(
      parseCatalogParams({ minCents: "10000", maxCents: "12000" }),
    );
    expect(priced.products.length).toBeGreaterThan(0);
    for (const product of priced.products) {
      expect(product.minPriceCents).toBeGreaterThanOrEqual(10_000);
      expect(product.minPriceCents).toBeLessThanOrEqual(12_000);
    }

    const firstPage = await listProducts(
      parseCatalogParams({ page: "1", pageSize: "12" }),
    );
    const secondPage = await listProducts(
      parseCatalogParams({ page: "2", pageSize: "12" }),
    );

    expect(firstPage.total).toBe(40);
    expect(firstPage.products).toHaveLength(12);
    expect(secondPage.products).toHaveLength(12);
    expect(secondPage.products[0]?.slug).not.toBe(firstPage.products[0]?.slug);
  });
});
