// URL state for the catalog. Everything the listing renders is derived from
// these values, so a filter change is a navigation — never React state.

export const PAGE_SIZES = [12, 24, 36] as const;
export type PageSize = (typeof PAGE_SIZES)[number];

export const DEFAULT_PAGE_SIZE: PageSize = 12;
export const MAX_PAGE = 10_000;
// $1,000,000.00. A catalogue filter above this is a typo, not a request.
export const MAX_PRICE_CENTS = 100_000_000;
export const MAX_QUERY_LENGTH = 120;

const CATEGORY_SLUG = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

export interface CatalogParams {
  page: number;
  pageSize: PageSize;
  category?: string;
  q?: string;
  minCents?: number;
  maxCents?: number;
}

export const DEFAULT_CATALOG_PARAMS: CatalogParams = {
  page: 1,
  pageSize: DEFAULT_PAGE_SIZE,
};

function firstValue(
  value: string | string[] | undefined,
): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

function nonNegativeInt(value: string | undefined, max: number): number | undefined {
  if (value === undefined) {
    return undefined;
  }

  const trimmed = value.trim();
  if (!/^\d+$/.test(trimmed)) {
    return undefined;
  }

  const parsed = Number(trimmed);
  if (!Number.isSafeInteger(parsed) || parsed < 0 || parsed > max) {
    return undefined;
  }

  return parsed;
}

function isPageSize(value: number | undefined): value is PageSize {
  return value !== undefined && (PAGE_SIZES as readonly number[]).includes(value);
}

/**
 * Parses `searchParams` into a canonical, bounded value.
 *
 * Invalid input is ignored rather than thrown: a URL is user input, and a bad
 * `page` should render page 1, not a 500. Duplicate keys take the first value.
 */
export function parseCatalogParams(
  input: Record<string, string | string[] | undefined>,
): CatalogParams {
  const rawPage = nonNegativeInt(firstValue(input.page), MAX_PAGE);
  const page = rawPage !== undefined && rawPage >= 1 ? rawPage : 1;

  const rawPageSize = nonNegativeInt(firstValue(input.pageSize), 1000);
  const pageSize = isPageSize(rawPageSize) ? rawPageSize : DEFAULT_PAGE_SIZE;

  const rawCategory = firstValue(input.category)?.trim();
  const category =
    rawCategory !== undefined &&
    rawCategory.length <= 64 &&
    CATEGORY_SLUG.test(rawCategory)
      ? rawCategory
      : undefined;

  const rawQuery = firstValue(input.q)?.trim();
  const q =
    rawQuery !== undefined && rawQuery.length > 0
      ? rawQuery.slice(0, MAX_QUERY_LENGTH)
      : undefined;

  const minCents = nonNegativeInt(firstValue(input.minCents), MAX_PRICE_CENTS);
  let maxCents = nonNegativeInt(firstValue(input.maxCents), MAX_PRICE_CENTS);

  // `min > max` is an empty range with no useful meaning. Drop the upper bound
  // rather than returning nothing or silently swapping the user's values.
  if (minCents !== undefined && maxCents !== undefined && minCents > maxCents) {
    maxCents = undefined;
  }

  return { page, pageSize, category, q, minCents, maxCents };
}

/**
 * Builds a canonical catalog URL. Page and page size are always present so the
 * complete listing state is visible in the address bar.
 */
export function catalogHref(
  params: CatalogParams,
  overrides: Partial<CatalogParams> = {},
): string {
  const merged: CatalogParams = { ...params, ...overrides };
  const search = new URLSearchParams();

  if (merged.q !== undefined && merged.q.length > 0) {
    search.set("q", merged.q);
  }
  if (merged.category !== undefined) {
    search.set("category", merged.category);
  }
  if (merged.minCents !== undefined) {
    search.set("minCents", String(merged.minCents));
  }
  if (merged.maxCents !== undefined) {
    search.set("maxCents", String(merged.maxCents));
  }
  search.set("page", String(merged.page));
  search.set("pageSize", String(merged.pageSize));

  return `/?${search.toString()}`;
}
