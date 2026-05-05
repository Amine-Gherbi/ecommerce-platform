// Shared catalogue vocabulary. Kept free of Prisma so client controls can use
// the option lists without pulling server code into their bundle.

export const PAGE_SIZE = 12;

export const SORT_OPTIONS = [
  { value: "newest", label: "Newest" },
  { value: "price-asc", label: "Price: low to high" },
  { value: "price-desc", label: "Price: high to low" },
  { value: "name", label: "Name" },
] as const;

export type SortKey = (typeof SORT_OPTIONS)[number]["value"];

export const PRICE_BANDS = [
  { id: "under-50", label: "Under €50.00", minCents: 0, maxCents: 4_999 },
  {
    id: "50-150",
    label: "€50.00 – €150.00",
    minCents: 5_000,
    maxCents: 14_999,
  },
  {
    id: "150-500",
    label: "€150.00 – €500.00",
    minCents: 15_000,
    maxCents: 49_999,
  },
  { id: "over-500", label: "€500.00 and up", minCents: 50_000 },
] as const;

export type PriceBand = (typeof PRICE_BANDS)[number];
export type PriceBandId = PriceBand["id"];

export type CatalogSearchParams = Record<
  string,
  string | string[] | undefined
>;

export interface CatalogFilters {
  brands: string[];
  band: PriceBandId | "";
  inStock: boolean;
  sort: SortKey;
  page: number;
}

function firstValue(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

function manyValues(value: string | string[] | undefined): string[] {
  const values = Array.isArray(value) ? value : [value];
  return values.filter(
    (entry): entry is string => typeof entry === "string" && entry.length > 0,
  );
}

export function parseSort(value: string | string[] | undefined): SortKey {
  const candidate = firstValue(value);
  return SORT_OPTIONS.some((option) => option.value === candidate)
    ? (candidate as SortKey)
    : "newest";
}

export function parsePage(value: string | string[] | undefined): number {
  const candidate = Number(firstValue(value));
  return Number.isInteger(candidate) && candidate > 0 ? candidate : 1;
}

export function parseCatalogFilters(
  searchParams: CatalogSearchParams,
): CatalogFilters {
  const bandCandidate = firstValue(searchParams.band);

  return {
    brands: manyValues(searchParams.brand),
    band: PRICE_BANDS.some((band) => band.id === bandCandidate)
      ? (bandCandidate as PriceBandId)
      : "",
    inStock: firstValue(searchParams.stock) === "1",
    sort: parseSort(searchParams.sort),
    page: parsePage(searchParams.page),
  };
}

export function priceBandById(id: PriceBandId | ""): PriceBand | undefined {
  return PRICE_BANDS.find((band) => band.id === id);
}

export function catalogQueryString(
  filters: CatalogFilters,
  overrides: { page?: number; includePage?: boolean } = {},
): string {
  const params = new URLSearchParams();

  for (const brand of filters.brands) {
    params.append("brand", brand);
  }
  if (filters.band !== "") {
    params.set("band", filters.band);
  }
  if (filters.inStock) {
    params.set("stock", "1");
  }
  if (filters.sort !== "newest") {
    params.set("sort", filters.sort);
  }

  const page = overrides.page ?? filters.page;
  if ((overrides.includePage ?? true) && page > 1) {
    params.set("page", String(page));
  }

  return params.toString();
}

export function sortQueryString(sort: SortKey): string {
  return sort === "newest" ? "" : `sort=${sort}`;
}
