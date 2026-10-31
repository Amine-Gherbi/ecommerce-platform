import Link from "next/link";
import { Suspense } from "react";

import { getNavCategories } from "@/lib/catalog";
import { focusRing } from "@/lib/styles";

import { AccountNav, AccountNavFallback } from "./account-nav";
import { CartCount } from "./cart-count";
import { Container } from "./ui";

function SearchIcon() {
  return (
    <svg
      viewBox="0 0 16 16"
      className="size-4"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.35"
      aria-hidden="true"
    >
      <circle cx="7" cy="7" r="4.25" />
      <path d="m10.3 10.3 3.2 3.2" strokeLinecap="round" />
    </svg>
  );
}

function SearchForm({ id }: { id: string }) {
  return (
    <form
      action="/search"
      method="get"
      role="search"
      className="flex h-10 w-full items-center rounded-full bg-surface pl-4 pr-1 transition-colors focus-within:outline focus-within:outline-2 focus-within:outline-offset-2 focus-within:outline-accent md:w-[240px]"
    >
      <label htmlFor={id} className="sr-only">
        Search products
      </label>
      <input
        id={id}
        type="search"
        name="q"
        placeholder="Search products"
        className="h-full min-w-0 flex-1 appearance-none bg-transparent text-[13px] text-ink placeholder:text-muted focus:outline-none"
      />
      <button
        type="submit"
        aria-label="Search"
        className={`flex size-8 shrink-0 items-center justify-center rounded-full text-muted transition-colors hover:text-accent ${focusRing}`}
      >
        <SearchIcon />
      </button>
    </form>
  );
}

function CategoryLinks({
  categories,
}: {
  categories: { slug: string; name: string }[];
}) {
  return (
    <>
      {categories.map((category) => (
        <Link
          key={category.slug}
          href={`/c/${category.slug}`}
          className="flex min-h-11 items-center whitespace-nowrap text-[11px] font-semibold uppercase leading-none tracking-[0.14em] text-muted transition-colors hover:text-ink"
        >
          {category.name}
        </Link>
      ))}
    </>
  );
}

export async function SiteHeader() {
  const categories = await getNavCategories();

  return (
    <header className="bg-page">
      <div className="sticky top-0 z-40 border-b border-rule bg-page">
        <Container>
          <div className="flex h-16 items-center gap-8">
            <Link
              href="/"
              className={`flex min-h-11 shrink-0 items-baseline gap-2 ${focusRing}`}
            >
              <span className="text-[22px] font-bold lowercase leading-none tracking-[-0.03em] text-ink">
                kestrel
              </span>
              <span className="text-[11px] font-semibold uppercase leading-none tracking-[0.14em] text-muted">
                audio
              </span>
            </Link>

            <nav
              aria-label="Product categories"
              className="hidden items-center gap-7 lg:flex"
            >
              <CategoryLinks categories={categories} />
            </nav>

            <div className="ml-auto flex items-center gap-5">
              <div className="hidden md:block">
                <SearchForm id="site-search-desktop" />
              </div>
              <Suspense fallback={<AccountNavFallback />}>
                <AccountNav />
              </Suspense>
              <CartCount />
            </div>
          </div>

          <div className="pb-3 md:hidden">
            <SearchForm id="site-search-mobile" />
          </div>

          <nav
            aria-label="Product categories"
            className="flex gap-6 overflow-x-auto border-t border-rule lg:hidden"
          >
            <CategoryLinks categories={categories} />
          </nav>
        </Container>
      </div>
    </header>
  );
}
