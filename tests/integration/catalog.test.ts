import { randomUUID } from "node:crypto";

import type { ProductStatus } from "@prisma/client";
import { beforeEach, describe, expect, it } from "vitest";

import {
  getCategoryPageData,
  getHomePageData,
  getNavCategories,
  getProductPageData,
  getSearchPageData,
} from "@/lib/catalog";

import { resetDatabase, testDb } from "./helpers";

beforeEach(async () => {
  await resetDatabase();
});

async function makeBrand(name = "Kestrel"): Promise<{ id: string; slug: string }> {
  const suffix = randomUUID().slice(0, 8);
  const brand = await testDb.brand.create({
    data: { slug: `brand-${suffix}`, name: `${name} ${suffix}` },
    select: { id: true, slug: true },
  });
  return brand;
}

async function makeCategory(
  slug: string,
  position = 0,
): Promise<{ id: string; slug: string }> {
  const category = await testDb.category.create({
    data: { slug, name: slug.replace(/-/g, " "), position },
    select: { id: true, slug: true },
  });
  return category;
}

interface MakeProductInput {
  categoryId: string;
  brandId: string;
  title: string;
  slug?: string;
  description?: string;
  specs?: unknown;
  status?: ProductStatus;
  createdAt?: Date;
  variants?: { title: string; priceCents: number; stock: number }[];
  images?: { url: string; alt: string }[];
}

async function makeProduct(input: MakeProductInput): Promise<{
  id: string;
  slug: string;
  variantIds: string[];
}> {
  const slug = input.slug ?? `product-${randomUUID().slice(0, 8)}`;
  const product = await testDb.product.create({
    data: {
      slug,
      title: input.title,
      brandId: input.brandId,
      categoryId: input.categoryId,
      description: input.description ?? "A product",
      specs: (input.specs ?? {}) as object,
      status: input.status ?? "ACTIVE",
      createdAt: input.createdAt,
      variants: {
        create: (input.variants ?? [
          { title: "Standard", priceCents: 1_000, stock: 5 },
        ]).map((variant, index) => ({
          ...variant,
          position: index,
          sku: `${slug}-${index}`.toUpperCase(),
        })),
      },
      images: {
        create: (input.images ?? []).map((image, index) => ({
          ...image,
          position: index,
        })),
      },
    },
    include: { variants: { orderBy: { position: "asc" } } },
  });

  return {
    id: product.id,
    slug,
    variantIds: product.variants.map((variant) => variant.id),
  };
}

describe("getNavCategories", () => {
  it("lists categories in their configured order", async () => {
    await makeCategory("speakers", 2);
    await makeCategory("headphones", 1);

    expect(await getNavCategories()).toEqual([
      { slug: "headphones", name: "headphones" },
      { slug: "speakers", name: "speakers" },
    ]);
  });
});

describe("getHomePageData", () => {
  it("prefers the hero product, counts active products and limits new arrivals", async () => {
    const brand = await makeBrand();
    const headphones = await makeCategory("headphones", 0);
    const speakers = await makeCategory("speakers", 1);

    const hero = await makeProduct({
      categoryId: headphones.id,
      brandId: brand.id,
      title: "Technics SL-1200 MK5",
      slug: "technics-sl-1200-mk5",
      createdAt: new Date("2026-01-01T00:00:00.000Z"),
      specs: { drive: "Direct", wow: "0.01%" },
      images: [
        { url: "https://example.test/hero-front.jpg", alt: "front" },
        { url: "https://example.test/hero-side.jpg", alt: "side" },
      ],
      variants: [
        { title: "Black", priceCents: 99_900, stock: 2 },
        { title: "Silver", priceCents: 104_900, stock: 0 },
      ],
    });

    await makeProduct({
      categoryId: headphones.id,
      brandId: brand.id,
      title: "Newer Headphones",
      status: "DRAFT",
      createdAt: new Date("2026-02-01T00:00:00.000Z"),
    });
    await makeProduct({
      categoryId: speakers.id,
      brandId: brand.id,
      title: "Shelf Speaker",
      createdAt: new Date("2026-01-15T00:00:00.000Z"),
      variants: [{ title: "Pair", priceCents: 30_000, stock: 4 }],
    });

    for (let index = 0; index < 10; index += 1) {
      await makeProduct({
        categoryId: speakers.id,
        brandId: brand.id,
        title: `Filler ${index}`,
        createdAt: new Date(`2025-12-${String(index + 1).padStart(2, "0")}T00:00:00.000Z`),
      });
    }

    const data = await getHomePageData();

    expect(data.hero?.slug).toBe(hero.slug);
    // Two variants at different prices → the lowest, with a "From" prefix.
    expect(data.hero?.pricePrefix).toBe("From ");
    // The draft product is not part of the storefront.
    expect(data.categoryTiles).toEqual([
      {
        slug: "headphones",
        name: "headphones",
        count: 1,
        image: {
          url: "https://example.test/hero-front.jpg",
          alt: "front",
        },
      },
      {
        slug: "speakers",
        name: "speakers",
        count: 11,
        image: null,
      },
    ]);
    expect(data.newProducts).toHaveLength(8);
  });

  it("falls back to the newest product and an empty state", async () => {
    const empty = await getHomePageData();
    expect(empty.hero).toBeNull();
    expect(empty.newProducts).toEqual([]);

    const brand = await makeBrand();
    const category = await makeCategory("accessories");
    const older = await makeProduct({
      categoryId: category.id,
      brandId: brand.id,
      title: "Older",
      createdAt: new Date("2026-01-01T00:00:00.000Z"),
      variants: [{ title: "Standard", priceCents: 2_500, stock: 0 }],
      images: [{ url: "https://example.test/older.jpg", alt: "older" }],
    });
    const newer = await makeProduct({
      categoryId: category.id,
      brandId: brand.id,
      title: "Newer",
      createdAt: new Date("2026-02-01T00:00:00.000Z"),
      variants: [{ title: "Standard", priceCents: 3_000, stock: 0 }],
    });

    const data = await getHomePageData();
    expect(data.hero?.slug).toBe(newer.slug);
    expect(data.hero?.pricePrefix).toBe("");
    expect(data.hero?.inStock).toBe(false);
    // A single-price product has no prefix; an image-less one stays null.
    expect(data.newProducts.map((product) => product.slug)).toEqual([
      newer.slug,
      older.slug,
    ]);
    expect(data.newProducts[1]?.image?.url).toBe(
      "https://example.test/older.jpg",
    );
  });
});

describe("getCategoryPageData", () => {
  it("returns null for an unknown category", async () => {
    await expect(getCategoryPageData("missing", {})).resolves.toBeNull();
  });

  it("filters by brand, price band and stock and paginates the result", async () => {
    const brandA = await makeBrand("Alpha");
    const brandB = await makeBrand("Beta");
    const category = await makeCategory("headphones");

    await makeProduct({
      categoryId: category.id,
      brandId: brandA.id,
      title: "Cheap Alpha",
      variants: [{ title: "Standard", priceCents: 2_000, stock: 3 }],
    });
    await makeProduct({
      categoryId: category.id,
      brandId: brandA.id,
      title: "Pricey Alpha",
      variants: [{ title: "Standard", priceCents: 20_000, stock: 3 }],
    });
    await makeProduct({
      categoryId: category.id,
      brandId: brandB.id,
      title: "Beta Sold Out",
      variants: [{ title: "Standard", priceCents: 2_500, stock: 0 }],
    });
    await makeProduct({
      categoryId: category.id,
      brandId: brandB.id,
      title: "Draft Beta",
      status: "DRAFT",
      variants: [{ title: "Standard", priceCents: 2_500, stock: 3 }],
    });

    const byBrand = await getCategoryPageData("headphones", {
      brand: brandB.slug,
    });
    expect(byBrand?.resultCount).toBe(1);
    expect(byBrand?.products[0]?.title).toBe("Beta Sold Out");
    expect(byBrand?.brands.map((brand) => brand.slug)).toContain(brandA.slug);

    const cheapAndAvailable = await getCategoryPageData("headphones", {
      band: "under-50",
      stock: "1",
    });
    expect(cheapAndAvailable?.products.map((product) => product.title)).toEqual(
      ["Cheap Alpha"],
    );

    const expensive = await getCategoryPageData("headphones", {
      band: "over-500",
    });
    expect(expensive?.resultCount).toBe(0);

    const secondPage = await getCategoryPageData("headphones", {
      page: "2",
      sort: "price-asc",
    });
    // Three active products, page size 12 → page 2 clamps back to page 1.
    expect(secondPage?.page).toBe(1);
    expect(secondPage?.pageCount).toBe(1);
    expect(secondPage?.filters.sort).toBe("price-asc");
    expect(secondPage?.baseQuery).toContain("sort=price-asc");
  });

  it("sorts by price both ways and by name, breaking ties by title", async () => {
    const brand = await makeBrand();
    const category = await makeCategory("speakers");

    await makeProduct({
      categoryId: category.id,
      brandId: brand.id,
      title: "Middle B",
      variants: [{ title: "Standard", priceCents: 5_000, stock: 1 }],
    });
    await makeProduct({
      categoryId: category.id,
      brandId: brand.id,
      title: "Cheap",
      variants: [{ title: "Standard", priceCents: 1_000, stock: 1 }],
    });
    await makeProduct({
      categoryId: category.id,
      brandId: brand.id,
      title: "Middle A",
      variants: [{ title: "Standard", priceCents: 5_000, stock: 1 }],
    });

    const ascending = await getCategoryPageData("speakers", {
      sort: "price-asc",
    });
    expect(ascending?.products.map((product) => product.title)).toEqual([
      "Cheap",
      "Middle A",
      "Middle B",
    ]);

    const descending = await getCategoryPageData("speakers", {
      sort: "price-desc",
    });
    expect(descending?.products.map((product) => product.title)).toEqual([
      "Middle A",
      "Middle B",
      "Cheap",
    ]);

    const byName = await getCategoryPageData("speakers", { sort: "name" });
    expect(byName?.products.map((product) => product.title)).toEqual([
      "Cheap",
      "Middle A",
      "Middle B",
    ]);
  });

  it("shows a second page when the category exceeds the page size", async () => {
    const brand = await makeBrand();
    const category = await makeCategory("accessories");

    for (let index = 0; index < 13; index += 1) {
      await makeProduct({
        categoryId: category.id,
        brandId: brand.id,
        title: `Product ${String(index).padStart(2, "0")}`,
        variants: [
          { title: "Standard", priceCents: 1_000 + index, stock: 1 },
        ],
      });
    }

    const first = await getCategoryPageData("accessories", { sort: "name" });
    const second = await getCategoryPageData("accessories", {
      sort: "name",
      page: "2",
    });

    expect(first?.pageCount).toBe(2);
    expect(first?.products).toHaveLength(12);
    expect(first?.resultCount).toBe(13);
    expect(second?.products).toHaveLength(1);
    expect(second?.page).toBe(2);
    // Filter links deliberately omit the page: changing a filter starts at 1.
    expect(second?.baseQuery).toBe("sort=name");
  });
});

describe("getSearchPageData", () => {
  it("returns an empty result for a blank query without hitting the catalogue", async () => {
    expect(await getSearchPageData("   ", {})).toEqual({
      query: "",
      products: [],
      resultCount: 0,
      page: 1,
      pageCount: 1,
      sort: "newest",
      basePath: "/search",
      baseQuery: "",
    });
  });

  it("matches title, description and brand, then serialises the query", async () => {
    const sony = await makeBrand("Sony");
    const kef = await makeBrand("KEF");
    const category = await makeCategory("headphones");

    await makeProduct({
      categoryId: category.id,
      brandId: sony.id,
      title: "Wireless Headphones",
      description: "Noise cancelling for travel",
      variants: [{ title: "Black", priceCents: 5_900, stock: 2 }],
    });
    await makeProduct({
      categoryId: category.id,
      brandId: kef.id,
      title: "Studio Monitor",
      description: "Near-field reference",
      variants: [{ title: "Pair", priceCents: 30_000, stock: 2 }],
    });

    const byTitle = await getSearchPageData("wireless", {});
    expect(byTitle.products.map((product) => product.title)).toEqual([
      "Wireless Headphones",
    ]);
    expect(byTitle.baseQuery).toBe("q=wireless");

    expect((await getSearchPageData("travel", {})).resultCount).toBe(1);
    expect((await getSearchPageData("KEF", {})).resultCount).toBe(1);

    const sorted = await getSearchPageData("monitor", { sort: "price-desc" });
    expect(sorted.sort).toBe("price-desc");
    expect(sorted.baseQuery).toContain("sort=price-desc");
    expect(sorted.baseQuery).toContain("q=monitor");
  });
});

describe("getProductPageData", () => {
  it("returns null for an unknown or variant-less product", async () => {
    const brand = await makeBrand();
    const category = await makeCategory("turntables");
    await makeProduct({
      categoryId: category.id,
      brandId: brand.id,
      title: "No variants",
      slug: "no-variants",
      variants: [],
    });

    await expect(getProductPageData("missing", undefined)).resolves.toBeNull();
    await expect(
      getProductPageData("no-variants", undefined),
    ).resolves.toBeNull();
  });

  it("renders the selected variant, defaults to an in-stock variant and sorts string specs", async () => {
    const brand = await makeBrand("Rega");
    const category = await makeCategory("turntables");

    const target = await makeProduct({
      categoryId: category.id,
      brandId: brand.id,
      title: "Planar 3",
      slug: "planar-3",
      description: "Belt drive turntable",
      specs: { speed: "33/45", drive: "Belt", number: 3, nested: {} },
      images: [
        { url: "https://example.test/front.jpg", alt: "front" },
      ],
      variants: [
        { title: "Black", priceCents: 65_000, stock: 2 },
        { title: "White", priceCents: 67_000, stock: 0 },
      ],
    });

    await makeProduct({
      categoryId: category.id,
      brandId: brand.id,
      title: "Older related",
      createdAt: new Date("2026-01-01T00:00:00.000Z"),
    });
    await makeProduct({
      categoryId: category.id,
      brandId: brand.id,
      title: "Newest related",
      createdAt: new Date("2026-03-01T00:00:00.000Z"),
    });
    await makeProduct({
      categoryId: category.id,
      brandId: brand.id,
      title: "Middle related",
      createdAt: new Date("2026-02-01T00:00:00.000Z"),
    });
    await makeProduct({
      categoryId: category.id,
      brandId: brand.id,
      title: "Fourth related",
      createdAt: new Date("2025-12-01T00:00:00.000Z"),
    });
    const otherCategory = await makeCategory("speakers");
    await makeProduct({
      categoryId: otherCategory.id,
      brandId: brand.id,
      title: "Other category",
    });

    const selected = await getProductPageData(
      target.slug,
      target.variantIds[1],
    );
    expect(selected?.selectedVariant).toEqual({
      id: target.variantIds[1],
      title: "White",
      price: "€670.00",
      inStock: false,
      maxQuantity: 0,
    });
    // Non-string spec values are dropped and labels are sorted.
    expect(selected?.specs).toEqual([
      { label: "drive", value: "Belt" },
      { label: "speed", value: "33/45" },
    ]);
    expect(selected?.variants).toHaveLength(2);
    expect(selected?.related.map((product) => product.title)).toEqual([
      "Newest related",
      "Middle related",
      "Older related",
    ]);

    // An unknown variant parameter falls back to the first variant in stock.
    const fallback = await getProductPageData(target.slug, "not-a-variant");
    expect(fallback?.selectedVariant.id).toBe(target.variantIds[0]);
    expect(fallback?.selectedVariant.inStock).toBe(true);
    expect(fallback?.images).toEqual([
      { url: "https://example.test/front.jpg", alt: "front" },
    ]);

    // A sold-out first variant must not be the default when another one has
    // stock; the picked variant and the picker labels follow the same stock.
    const soldOutFirst = await makeProduct({
      categoryId: category.id,
      brandId: brand.id,
      title: "Sold-out first",
      slug: "sold-out-first",
      variants: [
        { title: "Silver", priceCents: 10_000, stock: 0 },
        { title: "Black", priceCents: 12_000, stock: 3 },
      ],
    });
    const defaulted = await getProductPageData(soldOutFirst.slug, undefined);
    expect(defaulted?.selectedVariant).toEqual({
      id: soldOutFirst.variantIds[1],
      title: "Black",
      price: "€120.00",
      inStock: true,
      maxQuantity: 3,
    });
    expect(defaulted?.variants).toEqual([
      { id: soldOutFirst.variantIds[0], title: "Silver", inStock: false },
      { id: soldOutFirst.variantIds[1], title: "Black", inStock: true },
    ]);

    // With no stock anywhere the first variant stays selected and sold out.
    const allSoldOut = await makeProduct({
      categoryId: category.id,
      brandId: brand.id,
      title: "All sold out",
      slug: "all-sold-out",
      variants: [
        { title: "Silver", priceCents: 10_000, stock: 0 },
        { title: "Black", priceCents: 12_000, stock: 0 },
      ],
    });
    const unavailable = await getProductPageData(allSoldOut.slug, undefined);
    expect(unavailable?.selectedVariant).toEqual({
      id: allSoldOut.variantIds[0],
      title: "Silver",
      price: "€100.00",
      inStock: false,
      maxQuantity: 0,
    });
  });

  it("treats non-object specs as no specs", async () => {
    const brand = await makeBrand();
    const category = await makeCategory("accessories");
    const product = await makeProduct({
      categoryId: category.id,
      brandId: brand.id,
      title: "Odd specs",
      slug: "odd-specs",
      specs: ["not", "an", "object"],
    });

    const data = await getProductPageData(product.slug, undefined);
    expect(data?.specs).toEqual([]);
  });
});
