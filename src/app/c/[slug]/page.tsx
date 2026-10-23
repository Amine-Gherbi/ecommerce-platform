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
        <Container className="py-8 lg:py-12">
          <Breadcrumbs
            items={[
              { label: "Home", href: "/" },
              { label: category.name },
            ]}
          />
          <div className="mt-8 flex flex-wrap items-end justify-between gap-4">
            <div>
              <h1 className={pageTitleClass}>{category.name}</h1>
              <p className="mt-3 text-[13px] leading-5 text-ink/55">
                {countLabel}
                {hasFilters ? " matching your filters" : ""}
              </p>
            </div>
          </div>
        </Container>
      </section>

      <Container className="py-8 lg:py-12">
        <div className="lg:grid lg:grid-cols-[220px_1fr] lg:gap-12 xl:grid-cols-[240px_1fr] xl:gap-16">
          <aside className="hidden lg:block">
            <div className="sticky top-28">
              <h2 className={labelClass}>Filter</h2>
              <div className="mt-5">
                <CatalogFilters
                  action={basePath}
                  brands={brands}
                  filters={filters}
                />
              </div>
            </div>
          </aside>

          <div>
            <details className="border-y border-rule py-4 lg:hidden">
              <summary className="flex items-center justify-between gap-4 text-[11px] uppercase leading-4 tracking-[0.14em] text-ink/65">
                <span>Filters</span>
                <span className="text-ink/40">
                  {hasFilters ? "Active" : "Open"}
                </span>
              </summary>
              <div className="pt-7">
                <CatalogFilters
                  action={basePath}
                  brands={brands}
                  filters={filters}
                />
              </div>
            </details>

            <div className="mt-5 flex items-center justify-between gap-4 lg:mt-0">
              <p className="text-[13px] text-ink/45 lg:hidden">{countLabel}</p>
              <div className="ml-auto">
                <SortSelect
                  value={filters.sort}
                  basePath={basePath}
                  baseQuery={baseQuery}
                />
              </div>
            </div>

            <div className="mt-8">
              {products.length > 0 ? (
                <ProductGrid products={products} />
              ) : (
                <div className="border-t border-rule py-16 text-center">
                  <p className="text-[16px] leading-6 text-ink">
                    {hasFilters
                      ? "No products match these filters."
                      : "No products in this category yet."}
                  </p>
                  <p className="mx-auto mt-2 max-w-[42ch] text-[13px] leading-5 text-ink/55">
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
