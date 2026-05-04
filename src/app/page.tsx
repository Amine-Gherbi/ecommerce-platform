import type { Metadata } from "next";
import Link from "next/link";

import { FilterForm } from "@/components/filter-form";
import { Pagination } from "@/components/pagination";
import { ProductCard } from "@/components/product-card";
import { buttonVariants } from "@/components/ui/button";
import { listCategories, listProducts } from "@/lib/catalog";
import { catalogHref, parseCatalogParams } from "@/lib/catalog-params";
import { formatCents } from "@/lib/format";

export const metadata: Metadata = {
  title: "Catalog",
  description:
    "Browse the catalog by category, price and full-text search. Filters live in the URL.",
};

// This route is intentionally dynamic: `searchParams` is the single source of
// listing state, so every filtered view is rendered on the server per request.
// It does not read the session (there is no auth() call anywhere in this file or
// the root layout), so no *other* route is made dynamic by this one.
export default async function CatalogPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = parseCatalogParams(await searchParams);

  const [categories, result] = await Promise.all([
    listCategories(),
    listProducts(params),
  ]);

  const totalPages = Math.max(1, Math.ceil(result.total / params.pageSize));
  const range =
    params.minCents !== undefined || params.maxCents !== undefined
      ? `${params.minCents !== undefined ? formatCents(params.minCents) : "any"} – ${
          params.maxCents !== undefined ? formatCents(params.maxCents) : "any"
        }`
      : undefined;

  return (
    <main className="mx-auto w-full max-w-6xl px-4 py-8">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Catalog</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {result.total} {result.total === 1 ? "product" : "products"}
            {params.q !== undefined ? ` matching “${params.q}”` : ""}
            {" · "}page {Math.min(params.page, totalPages)} of {totalPages}
          </p>
        </div>
        {range !== undefined && (
          <p className="text-sm text-muted-foreground">From-price filter: {range}</p>
        )}
      </div>

      <FilterForm categories={categories} params={params} />

      {result.products.length === 0 ? (
        <div className="mt-10 rounded-xl border border-dashed p-10 text-center">
          <h2 className="text-lg font-semibold">No products match those filters</h2>
          <p className="mt-2 text-sm text-muted-foreground">
            Try a different category, a wider price range, or a shorter search.
          </p>
          <Link href="/" className={buttonVariants({ className: "mt-5" })}>
            Reset filters
          </Link>
        </div>
      ) : (
        <ul className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {result.products.map((product) => (
            <li key={product.id}>
              <ProductCard product={product} />
            </li>
          ))}
        </ul>
      )}

      <Pagination
        page={params.page}
        pageSize={params.pageSize}
        total={result.total}
        hrefForPage={(page) => catalogHref(params, { page })}
      />
    </main>
  );
}
