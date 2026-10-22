import { Prisma } from "@prisma/client";

import { db } from "@/lib/db";
import type { CatalogParams } from "@/lib/catalog-params";

export interface CategorySummary {
  slug: string;
  name: string;
}

export interface CatalogProduct {
  id: string;
  slug: string;
  name: string;
  description: string;
  categorySlug: string;
  categoryName: string;
  minPriceCents: number;
  variantCount: number;
  /** `ts_rank_cd` for the active search; 0 when there is no search term. */
  rank: number;
}

export interface CatalogResult {
  products: CatalogProduct[];
  total: number;
}

export interface ProductVariant {
  id: string;
  sku: string;
  name: string;
  priceCents: number;
  stock: number;
}

export interface ProductDetail {
  id: string;
  slug: string;
  name: string;
  description: string;
  category: CategorySummary;
  variants: ProductVariant[];
}

// The expression must match the GIN index exactly — same regconfig, same
// concatenation order — or PostgreSQL cannot use Product_search_tsv_idx.
const SEARCH_VECTOR = Prisma.sql`to_tsvector('english', p.name || ' ' || p.description)`;

function searchQuery(q: string): Prisma.Sql {
  return Prisma.sql`websearch_to_tsquery('english', ${q})`;
}

function buildWhere(params: CatalogParams): Prisma.Sql {
  const predicates: Prisma.Sql[] = [Prisma.sql`p."archivedAt" IS NULL`];

  if (params.category !== undefined) {
    predicates.push(Prisma.sql`c.slug = ${params.category}`);
  }
  // Price filters apply to the "from" price the listing displays: the cheapest
  // non-archived variant. Filtering on any variant would show a card whose
  // visible price is outside the requested range.
  if (params.minCents !== undefined) {
    predicates.push(Prisma.sql`agg."minPriceCents" >= ${params.minCents}`);
  }
  if (params.maxCents !== undefined) {
    predicates.push(Prisma.sql`agg."minPriceCents" <= ${params.maxCents}`);
  }
  if (params.q !== undefined) {
    predicates.push(Prisma.sql`${SEARCH_VECTOR} @@ ${searchQuery(params.q)}`);
  }

  return Prisma.join(predicates, " AND ");
}

// One lateral scan per surviving product; Variant_productId_idx serves it.
const FROM_PRODUCTS = Prisma.sql`
  FROM "Product" p
  JOIN "Category" c ON c.id = p."categoryId"
  JOIN LATERAL (
    SELECT
      MIN(v."priceCents") AS "minPriceCents",
      COUNT(*)::int AS "variantCount"
    FROM "Variant" v
    WHERE v."productId" = p.id AND v."archivedAt" IS NULL
  ) agg ON agg."variantCount" > 0
`;

/**
 * Lists one page of the catalog. Text search is ranked with `ts_rank_cd`;
 * without a query, recency is the order. `p.id` breaks ties so pagination is
 * stable across requests.
 */
export async function listProducts(params: CatalogParams): Promise<CatalogResult> {
  const where = buildWhere(params);
  const offset = (params.page - 1) * params.pageSize;

  const rank = params.q !== undefined
    ? Prisma.sql`ts_rank_cd(${SEARCH_VECTOR}, ${searchQuery(params.q)})`
    : Prisma.sql`0::real`;

  const order = params.q !== undefined
    ? Prisma.sql`"rank" DESC, p."createdAt" DESC, p.id DESC`
    : Prisma.sql`p."createdAt" DESC, p.id DESC`;

  const rowsQuery = Prisma.sql`
    SELECT
      p.id,
      p.slug,
      p.name,
      p.description,
      c.slug AS "categorySlug",
      c.name AS "categoryName",
      agg."minPriceCents",
      agg."variantCount",
      ${rank} AS "rank"
    ${FROM_PRODUCTS}
    WHERE ${where}
    ORDER BY ${order}
    LIMIT ${params.pageSize}
    OFFSET ${offset}
  `;

  const countQuery = Prisma.sql`
    SELECT COUNT(*)::int AS "total"
    ${FROM_PRODUCTS}
    WHERE ${where}
  `;

  const [products, totals] = await Promise.all([
    db.$queryRaw<CatalogProduct[]>(rowsQuery),
    db.$queryRaw<Array<{ total: number }>>(countQuery),
  ]);

  return {
    products,
    total: totals[0]?.total ?? 0,
  };
}

export async function listCategories(): Promise<CategorySummary[]> {
  return db.category.findMany({
    select: { slug: true, name: true },
    orderBy: { name: "asc" },
  });
}

export async function listProductSlugs(): Promise<string[]> {
  const products = await db.product.findMany({
    where: { archivedAt: null },
    select: { slug: true },
    orderBy: { slug: "asc" },
  });

  return products.map((product) => product.slug);
}

export async function getProductBySlug(slug: string): Promise<ProductDetail | null> {
  return db.product.findFirst({
    where: { slug, archivedAt: null },
    select: {
      id: true,
      slug: true,
      name: true,
      description: true,
      category: { select: { slug: true, name: true } },
      variants: {
        where: { archivedAt: null },
        orderBy: [{ priceCents: "asc" }, { name: "asc" }],
        select: {
          id: true,
          sku: true,
          name: true,
          priceCents: true,
          stock: true,
        },
      },
    },
  });
}
