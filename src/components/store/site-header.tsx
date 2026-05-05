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

function SearchForm() {
  return (
    <form
      action="/search"
      method="get"
      role="search"
      className="flex h-9 w-full border border-rule bg-surface transition-colors focus-within:border-ink"
    >
      <input
        type="search"
        name="q"
        aria-label="Search products"
        placeholder="Search products"
        className="h-full min-w-0 flex-1 appearance-none bg-transparent px-3 text-[13px] text-ink placeholder:text-ink/40 focus:outline-none"
      />
      <button
        type="submit"
        aria-label="Search"
        className={`flex h-full w-9 shrink-0 items-center justify-center border-l border-rule text-ink/60 transition-colors hover:bg-ink/[0.04] hover:text-ink ${focusRing}`}
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
          className="whitespace-nowrap text-[13px] leading-5 text-ink/70 transition-colors hover:text-ink"
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
    <header className="sticky top-0 z-40 border-b border-rule bg-surface">
      <Container>
        <div className="flex h-14 items-center gap-6 lg:h-16">
          <Link href="/" className="shrink-0" aria-label="Kestrel Audio home">
            <span className="flex items-baseline gap-2">
              <span className="text-[20px] font-medium leading-none tracking-[-0.02em] text-ink">
                Kestrel
              </span>
              <span className="text-[11px] uppercase leading-none tracking-[0.18em] text-ink/45">
                Audio
              </span>
            </span>
          </Link>

          <nav
            aria-label="Product categories"
            className="hidden items-center gap-6 lg:flex"
          >
            <CategoryLinks categories={categories} />
          </nav>

          <div className="ml-auto flex items-center gap-5">
            <div className="hidden w-52 md:block xl:w-64">
              <SearchForm />
            </div>
            <Suspense fallback={<AccountNavFallback />}>
              <AccountNav />
            </Suspense>
            <CartCount />
          </div>
        </div>

        <div className="pb-3 md:hidden">
          <SearchForm />
        </div>

        <nav
          aria-label="Product categories"
          className="flex gap-5 overflow-x-auto border-t border-rule py-2.5 lg:hidden"
        >
          <CategoryLinks categories={categories} />
        </nav>
      </Container>
    </header>
  );
}
