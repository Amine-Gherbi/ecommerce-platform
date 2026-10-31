import type { Metadata } from "next";
import Link from "next/link";

import { Pagination } from "@/components/store/pagination";
import { ProductGrid } from "@/components/store/product-grid";
import { SortSelect } from "@/components/store/sort-select";
import { Breadcrumbs, Container } from "@/components/store/ui";
import { getSearchPageData } from "@/lib/catalog";
import type { CatalogSearchParams } from "@/lib/catalog-shared";
import { searchDescription } from "@/lib/seo";
import {
  pageTitleClass,
  primaryButtonClass,
  secondaryButtonClass,
} from "@/lib/styles";

interface SearchPageProps {
  searchParams: Promise<CatalogSearchParams>;
}

function firstValue(value: string | string[] | undefined): string {
  if (Array.isArray(value)) {
    return value[0] ?? "";
  }
  return value ?? "";
}

export async function generateMetadata({
  searchParams,
}: SearchPageProps): Promise<Metadata> {
  const query = firstValue((await searchParams).q).trim();
  return {
    title: query.length > 0 ? `Search: ${query}` : "Search",
    description: searchDescription(query),
  };
}

export default async function SearchPage({ searchParams }: SearchPageProps) {
  const query = await searchParams;
  const rawQuery = firstValue(query.q);
  const data = await getSearchPageData(rawQuery, query);

  const countLabel = `${data.resultCount} ${
    data.resultCount === 1 ? "product" : "products"
  }`;

  return (
    <div>
      <section className="border-b border-rule">
        <Container className="py-8 lg:py-12">
          <Breadcrumbs
            items={[
              { label: "Home", href: "/" },
              { label: "Search" },
            ]}
          />
          <div className="mt-8">
            <h1 className={pageTitleClass}>Search</h1>
            <p className="mt-3 text-[13px] leading-5 text-muted">
              {data.query.length > 0 ? (
                <>
                  <span className="text-ink">“{data.query}”</span>
                  <span aria-hidden="true"> · </span>
                  {countLabel}
                </>
              ) : (
                "Enter a search term to see products."
              )}
            </p>
          </div>
        </Container>
      </section>

      <Container className="py-8 lg:py-12">
        {data.query.length > 0 ? (
          <div className="flex items-center justify-between gap-4">
            <p className="text-[13px] text-muted">{countLabel}</p>
            <div className="ml-auto">
              <SortSelect
                value={data.sort}
                basePath={data.basePath}
                baseQuery={data.baseQuery}
              />
            </div>
          </div>
        ) : null}

        {data.products.length > 0 ? (
          <div className="mt-8">
            <ProductGrid products={data.products} />
          </div>
        ) : (
          <div className="border-t border-rule py-16 text-center">
            {data.query.length > 0 ? (
              <>
                <p className="text-[17px] leading-6 text-ink">
                  No products match “{data.query}”.
                </p>
                <p className="mx-auto mt-2 max-w-[42ch] text-[13px] leading-5 text-muted">
                  Check the spelling or try a brand, product type or model name.
                </p>
                <div className="mt-6 flex flex-wrap items-center justify-center gap-4">
                  <Link href="/search" className={secondaryButtonClass}>
                    Clear search
                  </Link>
                  <Link href="/c/headphones" className={primaryButtonClass}>
                    Browse headphones
                  </Link>
                </div>
              </>
            ) : (
              <>
                <p className="text-[17px] leading-6 text-ink">
                  Start with a product, brand or model.
                </p>
                <p className="mx-auto mt-2 max-w-[42ch] text-[13px] leading-5 text-muted">
                  The search field is in the header on every page.
                </p>
                <Link
                  href="/c/headphones"
                  className={`${primaryButtonClass} mt-6`}
                >
                  Browse headphones
                </Link>
              </>
            )}
          </div>
        )}

        {data.products.length > 0 ? (
          <Pagination
            page={data.page}
            pageCount={data.pageCount}
            basePath={data.basePath}
            baseQuery={data.baseQuery}
          />
        ) : null}
      </Container>
    </div>
  );
}
