import type { Prisma } from "@prisma/client";

import { db } from "@/lib/db";

import {
  PAGE_SIZE,
  catalogQueryString,
  parseCatalogFilters,
  parsePage,
  parseSort,
  priceBandById,
  type CatalogFilters,
  type CatalogSearchParams,
  type SortKey,
} from "./catalog-shared";
import { MAX_CART_QUANTITY, formatPrice } from "./money";

const productInclude = {
  brand: { select: { name: true, slug: true } },
  category: { select: { name: true, slug: true } },
  images: {
    orderBy: { position: "asc" },
    select: { url: true, alt: true },
  },
  variants: {
    orderBy: { position: "asc" },
    select: {
      id: true,
      title: true,
      sku: true,
      priceCents: true,
      stock: true,
    },
  },
} satisfies Prisma.ProductInclude;

type ProductRecord = Prisma.ProductGetPayload<{
  include: typeof productInclude;
}>;

export interface ProductImageModel {
  url: string;
  alt: string;
}

export interface ProductCardModel {
  slug: string;
  title: string;
  brandName: string;
  brandSlug: string;
  categoryName: string;
  price: string;
  pricePrefix: string;
  inStock: boolean;
  image: ProductImageModel | null;
}

export interface NavCategory {
  slug: string;
  name: string;
}

export interface CategoryTile extends NavCategory {
  count: number;
  image: ProductImageModel | null;
}

export interface HomePageData {
  hero: ProductCardModel | null;
  categoryTiles: CategoryTile[];
  newProducts: ProductCardModel[];
}

export interface CategoryPageData {
  category: NavCategory;
  brands: { slug: string; name: string }[];
  products: ProductCardModel[];
  resultCount: number;
  page: number;
  pageCount: number;
  filters: CatalogFilters;
  basePath: string;
  baseQuery: string;
}

export interface SearchPageData {
  query: string;
  products: ProductCardModel[];
  resultCount: number;
  page: number;
  pageCount: number;
  sort: SortKey;
  basePath: string;
  baseQuery: string;
}

export interface ProductDetailData {
  slug: string;
  title: string;
  description: string;
  brandName: string;
  brandSlug: string;
  categoryName: string;
  categorySlug: string;
  images: ProductImageModel[];
  specs: { label: string; value: string }[];
  variants: { id: string; title: string }[];
  selectedVariant: {
    id: string;
    title: string;
    price: string;
    inStock: boolean;
    maxQuantity: number;
  };
  related: ProductCardModel[];
}

function minPrice(product: ProductRecord): number {
  let minimum = Number.MAX_SAFE_INTEGER;
  for (const variant of product.variants) {
    minimum = Math.min(minimum, variant.priceCents);
  }
  return minimum;
}

function cardPrice(product: ProductRecord): { price: string; pricePrefix: string } {
  const prices = product.variants.map((variant) => variant.priceCents);
  const hasMultiplePrices = new Set(prices).size > 1;
  return {
    price: formatPrice(minPrice(product)),
    pricePrefix: hasMultiplePrices ? "From " : "",
  };
}

function toCard(product: ProductRecord): ProductCardModel {
  const { price, pricePrefix } = cardPrice(product);
  return {
    slug: product.slug,
    title: product.title,
    brandName: product.brand.name,
    brandSlug: product.brand.slug,
    categoryName: product.category.name,
    price,
    pricePrefix,
    inStock: product.variants.some((variant) => variant.stock > 0),
    image: product.images[0] ?? null,
  };
}

function sortRecords(products: ProductRecord[], sort: SortKey): ProductRecord[] {
  const sorted = [...products];
  sorted.sort((a, b) => {
    switch (sort) {
      case "price-asc": {
        const difference = minPrice(a) - minPrice(b);
        return difference !== 0
          ? difference
          : a.title.localeCompare(b.title, "en", { sensitivity: "base" });
      }
      case "price-desc": {
        const difference = minPrice(b) - minPrice(a);
        return difference !== 0
          ? difference
          : a.title.localeCompare(b.title, "en", { sensitivity: "base" });
      }
      case "name":
        return a.title.localeCompare(b.title, "en", { sensitivity: "base" });
      case "newest":
      default:
        return b.createdAt.getTime() - a.createdAt.getTime();
    }
  });
  return sorted;
}

function paginate<T>(
  products: T[],
  requestedPage: number,
): { page: number; pageCount: number; pageProducts: T[] } {
  const pageCount = Math.max(1, Math.ceil(products.length / PAGE_SIZE));
  const page = Math.min(requestedPage, pageCount);
  const start = (page - 1) * PAGE_SIZE;
  return {
    page,
    pageCount,
    pageProducts: products.slice(start, start + PAGE_SIZE),
  };
}

function withVariantFilter(
  filters: CatalogFilters,
): Prisma.VariantWhereInput | null {
  const variantFilter: Prisma.VariantWhereInput = {};
  const band = priceBandById(filters.band);

  if (band !== undefined) {
    const maxCents = "maxCents" in band ? band.maxCents : undefined;
    variantFilter.priceCents = {
      gte: band.minCents,
      ...(maxCents !== undefined ? { lte: maxCents } : {}),
    };
  }
  if (filters.inStock) {
    variantFilter.stock = { gt: 0 };
  }

  return Object.keys(variantFilter).length > 0 ? variantFilter : null;
}

function specEntries(
  specs: Prisma.JsonValue,
): { label: string; value: string }[] {
  if (specs === null || typeof specs !== "object" || Array.isArray(specs)) {
    return [];
  }

  return Object.entries(specs)
    .filter((entry): entry is [string, string] => typeof entry[1] === "string")
    .map(([label, value]) => ({ label, value }))
    .sort((a, b) => a.label.localeCompare(b.label, "en", { sensitivity: "base" }));
}

export async function getNavCategories(): Promise<NavCategory[]> {
  return db.category.findMany({
    orderBy: { position: "asc" },
    select: { slug: true, name: true },
  });
}

export async function getHomePageData(): Promise<HomePageData> {
  const [categories, products] = await Promise.all([
    db.category.findMany({ orderBy: { position: "asc" } }),
    db.product.findMany({
      where: { status: "ACTIVE" },
      include: productInclude,
      orderBy: { createdAt: "desc" },
    }),
  ]);

  const heroRecord =
    products.find((product) => product.slug === "technics-sl-1200-mk5") ??
    products[0] ??
    null;

  const categoryTiles: CategoryTile[] = categories.map((category) => {
    const categoryProducts = products.filter(
      (product) => product.categoryId === category.id,
    );
    const firstWithImage = categoryProducts.find(
      (product) => product.images.length > 0,
    );

    return {
      slug: category.slug,
      name: category.name,
      count: categoryProducts.length,
      image: firstWithImage?.images[0] ?? null,
    };
  });

  return {
    hero: heroRecord === null ? null : toCard(heroRecord),
    categoryTiles,
    newProducts: products.slice(0, 8).map(toCard),
  };
}

export async function getCategoryPageData(
  slug: string,
  searchParams: CatalogSearchParams,
): Promise<CategoryPageData | null> {
  const category = await db.category.findUnique({
    where: { slug },
    select: { id: true, slug: true, name: true },
  });
  if (category === null) {
    return null;
  }

  const filters = parseCatalogFilters(searchParams);
  const [brands, products] = await Promise.all([
    db.brand.findMany({
      where: {
        products: {
          some: { categoryId: category.id, status: "ACTIVE" },
        },
      },
      orderBy: { name: "asc" },
      select: { slug: true, name: true },
    }),
    (() => {
      const where: Prisma.ProductWhereInput = {
        categoryId: category.id,
        status: "ACTIVE",
      };

      if (filters.brands.length > 0) {
        where.brand = { slug: { in: filters.brands } };
      }

      const variantFilter = withVariantFilter(filters);
      if (variantFilter !== null) {
        where.variants = { some: variantFilter };
      }

      return db.product.findMany({
        where,
        include: productInclude,
      });
    })(),
  ]);

  const sorted = sortRecords(products, filters.sort);
  const { page, pageCount, pageProducts } = paginate(sorted, filters.page);
  const basePath = `/c/${category.slug}`;

  return {
    category: { slug: category.slug, name: category.name },
    brands,
    products: pageProducts.map(toCard),
    resultCount: sorted.length,
    page,
    pageCount,
    filters: { ...filters, page },
    basePath,
    baseQuery: catalogQueryString(
      { ...filters, page },
      { includePage: false },
    ),
  };
}

export async function getSearchPageData(
  rawQuery: string,
  searchParams: CatalogSearchParams,
): Promise<SearchPageData> {
  const query = rawQuery.trim().slice(0, 120);
  const sort = parseSort(searchParams.sort);
  const requestedPage = parsePage(searchParams.page);
  const basePath = "/search";

  let records: ProductRecord[] = [];
  if (query.length > 0) {
    records = await db.product.findMany({
      where: {
        status: "ACTIVE",
        OR: [
          { title: { contains: query, mode: "insensitive" } },
          { description: { contains: query, mode: "insensitive" } },
          { brand: { name: { contains: query, mode: "insensitive" } } },
        ],
      },
      include: productInclude,
    });
  }

  const sorted = sortRecords(records, sort);
  const { page, pageCount, pageProducts } = paginate(sorted, requestedPage);
  const params = new URLSearchParams();
  if (query.length > 0) {
    params.set("q", query);
  }
  if (sort !== "newest") {
    params.set("sort", sort);
  }

  return {
    query,
    products: pageProducts.map(toCard),
    resultCount: sorted.length,
    page,
    pageCount,
    sort,
    basePath,
    baseQuery: params.toString(),
  };
}

export async function getProductPageData(
  slug: string,
  variantParam: string | undefined,
): Promise<ProductDetailData | null> {
  const product = await db.product.findFirst({
    where: { slug, status: "ACTIVE" },
    include: productInclude,
  });
  if (product === null) {
    return null;
  }

  const [firstVariant] = product.variants;
  if (firstVariant === undefined) {
    return null;
  }

  const selectedVariant =
    product.variants.find((variant) => variant.id === variantParam) ??
    firstVariant;

  const relatedRecords = await db.product.findMany({
    where: {
      status: "ACTIVE",
      categoryId: product.categoryId,
      id: { not: product.id },
    },
    include: productInclude,
    orderBy: { createdAt: "desc" },
    take: 3,
  });

  return {
    slug: product.slug,
    title: product.title,
    description: product.description,
    brandName: product.brand.name,
    brandSlug: product.brand.slug,
    categoryName: product.category.name,
    categorySlug: product.category.slug,
    images: product.images.map((image) => ({
      url: image.url,
      alt: image.alt,
    })),
    specs: specEntries(product.specs),
    variants: product.variants.map((variant) => ({
      id: variant.id,
      title: variant.title,
    })),
    selectedVariant: {
      id: selectedVariant.id,
      title: selectedVariant.title,
      price: formatPrice(selectedVariant.priceCents),
      inStock: selectedVariant.stock > 0,
      maxQuantity: Math.min(selectedVariant.stock, MAX_CART_QUANTITY),
    },
    related: relatedRecords.map(toCard),
  };
}
