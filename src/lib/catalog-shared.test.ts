import { describe, expect, it } from "vitest";

import {
  PAGE_SIZE,
  catalogQueryString,
  parseCatalogFilters,
  parsePage,
  parseSort,
  priceBandById,
  sortQueryString,
  type CatalogFilters,
} from "./catalog-shared";

describe("parseSort", () => {
  it("accepts every offered sort and falls back to newest", () => {
    expect(parseSort("price-asc")).toBe("price-asc");
    expect(parseSort(["price-desc", "name"])).toBe("price-desc");
    expect(parseSort("name")).toBe("name");
    expect(parseSort("newest")).toBe("newest");
    expect(parseSort("cheapest")).toBe("newest");
    expect(parseSort(undefined)).toBe("newest");
  });
});

describe("parsePage", () => {
  it("accepts a positive whole page number and rejects everything else", () => {
    expect(parsePage("3")).toBe(3);
    expect(parsePage(["2"])).toBe(2);
    expect(parsePage("0")).toBe(1);
    expect(parsePage("-4")).toBe(1);
    expect(parsePage("1.5")).toBe(1);
    expect(parsePage(undefined)).toBe(1);
  });
});

describe("parseCatalogFilters", () => {
  it("reads repeated brands, a known band, stock and sort", () => {
    expect(
      parseCatalogFilters({
        brand: ["sony", "kef"],
        band: "50-150",
        stock: "1",
        sort: "price-asc",
        page: "2",
      }),
    ).toEqual({
      brands: ["sony", "kef"],
      band: "50-150",
      inStock: true,
      sort: "price-asc",
      page: 2,
    });
  });

  it("ignores unknown bands and empty brand values", () => {
    expect(
      parseCatalogFilters({ brand: "", band: "free", stock: "0" }),
    ).toEqual({
      brands: [],
      band: "",
      inStock: false,
      sort: "newest",
      page: 1,
    });
  });
});

describe("priceBandById", () => {
  it("finds a band, including the open-ended one", () => {
    const under = priceBandById("under-50");
    expect(under !== undefined && "maxCents" in under ? under.maxCents : null).toBe(
      4_999,
    );
    expect(priceBandById("over-500")?.minCents).toBe(50_000);
    expect("maxCents" in (priceBandById("over-500") ?? {})).toBe(false);
    expect(priceBandById("")).toBeUndefined();
  });
});

describe("catalogQueryString", () => {
  const filters: CatalogFilters = {
    brands: ["sony", "kef"],
    band: "50-150",
    inStock: true,
    sort: "price-asc",
    page: 3,
  };

  it("round-trips the filters that are active", () => {
    const query = new URLSearchParams(catalogQueryString(filters));
    expect(query.getAll("brand")).toEqual(["sony", "kef"]);
    expect(query.get("band")).toBe("50-150");
    expect(query.get("stock")).toBe("1");
    expect(query.get("sort")).toBe("price-asc");
    expect(query.get("page")).toBe("3");
  });

  it("omits defaults and can drop the page for filter links", () => {
    expect(
      catalogQueryString(
        { brands: [], band: "", inStock: false, sort: "newest", page: 1 },
        { includePage: false },
      ),
    ).toBe("");
    expect(
      catalogQueryString(filters, { page: 1, includePage: false }),
    ).not.toContain("page=");
  });
});

describe("sortQueryString", () => {
  it("only serialises a non-default sort", () => {
    expect(sortQueryString("newest")).toBe("");
    expect(sortQueryString("name")).toBe("sort=name");
  });
});

describe("PAGE_SIZE", () => {
  it("is the page size the catalogue paginates by", () => {
    expect(PAGE_SIZE).toBe(12);
  });
});
