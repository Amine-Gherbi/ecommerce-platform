import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { CatalogFilters } from "@/components/store/catalog-filters";
import { Pagination } from "@/components/store/pagination";
import { ProductGrid } from "@/components/store/product-grid";
import { SortSelect } from "@/components/store/sort-select";
import { Breadcrumbs, Container } from "@/components/store/ui";
import { getCategoryPageData } from "@/lib/catalog";
import type { CatalogSearchParams } from "@/lib/catalog-shared";
import {
  labelClass,
  pageTitleClass,
  primaryButtonClass,
} from "@/lib/styles";

interface CategoryPageProps {
  params: Promise<{ slug: string }>;
  searchParams: Promise<CatalogSearchParams>;
}

export async function generateMetadata({
  params,
}: Pick<CategoryPageProps, "params">): Promise<Metadata> {
  const { slug } = await params;
  const data = await getCategoryPageData(slug, {});

  if (data === null) {
    return { title: "Category not found" };
  }

  return {
    title: data.category.name,
    description: `Shop ${data.category.name.toLowerCase()} at Kestrel Audio.`,
  };
}

export default async function CategoryPage({
  params,
  searchParams,
}: CategoryPageProps) {
  const [{ slug }, query] = await Promise.all([params, searchParams]);
  const data = await getCategoryPageData(slug, query);

  if (data === null) {
    notFound();
  }

  const {
    category,
    brands,
    products,
    resultCount,
    page,
    pageCount,
    filters,
    basePath,
    baseQuery,
  } = data;
  const hasFilters =
    filters.brands.length > 0 ||
    filters.band !== "" ||
    filters.inStock;

  const countLabel = `${resultCount} ${
    resultCount === 1 ? "product" : "products"
  }`;

  return (
    <div>
      <section className="border-b border-rule">
        <Container className="py-6 lg:py-10">
          <Breadcrumbs
            items={[
              { label: "Home", href: "/" },
              { label: category.name },
            ]}
          />
          <div className="mt-4 flex flex-wrap items-end justify-between gap-4">
            <div>
              <h1 className={pageTitleClass}>{category.name}</h1>
              <h2 className="mt-2 text-[13px] uppercase tracking-[0.14em] text-muted">
                {countLabel}
                {hasFilters ? " matching your filters" : ""}
              </h2>
            </div>
          </div>
        </Container>
      </section>

      <Container className="py-6 lg:py-10">
        <div className="lg:grid lg:grid-cols-[220px_1fr] lg:gap-12 xl:grid-cols-[240px_1fr] xl:gap-16">
          <aside className="hidden lg:block">
            <div className="sticky top-20">
              <h2 className={labelClass}>Filter</h2>
              <div className="mt-3">
                <CatalogFilters
                  action={basePath}
                  brands={brands}
                  filters={filters}
                />
              </div>
            </div>
          </aside>

          <div>
            <details className="border-y border-rule lg:hidden">
              <summary className="flex min-h-11 items-center justify-between gap-4 text-[11px] font-medium uppercase leading-4 tracking-[0.14em] text-ink">
                <span>Filters</span>
                <span className="text-muted">
                  {hasFilters ? "Active" : "Open"}
                </span>
              </summary>
              <div className="pb-6 pt-2">
                <CatalogFilters
                  action={basePath}
                  brands={brands}
                  filters={filters}
                />
              </div>
            </details>

            <div className="mt-5 flex items-center justify-between gap-4 lg:mt-0">
              <p className="text-[13px] uppercase tracking-[0.14em] text-muted lg:hidden">
                {countLabel}
              </p>
              <div className="ml-auto">
                <SortSelect
                  value={filters.sort}
                  basePath={basePath}
                  baseQuery={baseQuery}
                />
              </div>
            </div>

            <div className="mt-6">
              {products.length > 0 ? (
                <ProductGrid products={products} />
              ) : (
                <div className="border-t border-rule py-16 text-center">
                  <p className="text-[15px] leading-6 text-ink">
                    {hasFilters
                      ? "No products match these filters."
                      : "No products in this category yet."}
                  </p>
                  <p className="mx-auto mt-2 max-w-[42ch] text-[13px] leading-5 text-muted">
                    {hasFilters
                      ? "Clear the filters to see the full category."
                      : "The catalogue changes from month to month."}
                  </p>
                  <Link
                    href={hasFilters ? basePath : "/"}
                    className={`${primaryButtonClass} mt-6`}
                  >
                    {hasFilters ? "Clear filters" : "Back to the shop"}
                  </Link>
                </div>
              )}
            </div>

            <Pagination
              page={page}
              pageCount={pageCount}
              basePath={basePath}
              baseQuery={baseQuery}
            />
          </div>
        </div>
      </Container>
    </div>
  );
}
