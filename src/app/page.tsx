import Image from "next/image";
import Link from "next/link";

import { ProductGrid } from "@/components/store/product-grid";
import { Container } from "@/components/store/ui";
import { getHomePageData } from "@/lib/catalog";
import {
  eyebrowClass,
  primaryButtonClass,
  sectionTitleClass,
  textLinkClass,
} from "@/lib/styles";
import { cn } from "@/lib/utils";

export default async function HomePage() {
  const { hero, categoryTiles, newProducts } = await getHomePageData();

  return (
    <div>
      <section className="border-b border-rule">
        <Container className="grid gap-6 py-6 lg:grid-cols-12 lg:items-center lg:gap-12 lg:py-8">
          {hero !== null ? (
            <>
              <div className="min-w-0 lg:col-span-6">
                <p className={eyebrowClass}>
                  Featured · {hero.categoryName}
                </p>
                <h1 className="mt-3 max-w-[20ch] text-[30px] font-semibold leading-[1.02] tracking-[-0.02em] text-ink lg:text-[40px]">
                  {hero.title}
                </h1>
                <p className="mt-4 text-[22px] leading-7 font-semibold tabular-nums tracking-[-0.02em] text-accent lg:text-[30px] lg:leading-9">
                  {hero.pricePrefix}
                  {hero.price}
                </p>
                <p className="mt-3 max-w-[42ch] text-[15px] leading-6 text-muted">
                  {hero.inStock
                    ? "In stock now, and ships from our warehouse in Lyon. Order before 14:00 CET on a weekday and it leaves the same day."
                    : "Currently sold out. Check back soon, or browse the rest of the range."}
                </p>
                <div className="mt-5 flex flex-wrap items-center gap-x-6 gap-y-3">
                  <Link
                    href={`/p/${hero.slug}`}
                    className={primaryButtonClass}
                  >
                    Shop this product
                  </Link>
                  <Link
                    href="#new-this-month"
                    className={cn(
                      "inline-flex min-h-11 items-center text-[13px] uppercase tracking-[0.14em] text-ink",
                      textLinkClass,
                    )}
                  >
                    See new arrivals
                  </Link>
                </div>
              </div>

              <div className="min-w-0 lg:col-span-6">
                <Link
                  href={`/p/${hero.slug}`}
                  className="group block overflow-hidden bg-surface"
                >
                  <div className="relative aspect-[2/1] overflow-hidden bg-surface">
                    {hero.image !== null ? (
                      <Image
                        src={hero.image.url}
                        alt={hero.image.alt}
                        width={1600}
                        height={900}
                        priority
                        sizes="(max-width: 1023px) 100vw, 50vw"
                        className="h-full w-full object-cover transition-opacity duration-200 group-hover:opacity-80"
                      />
                    ) : (
                      <div className="flex h-full items-center justify-center text-[13px] text-muted">
                        Image unavailable
                      </div>
                    )}
                  </div>
                </Link>
              </div>
            </>
          ) : (
            <div className="lg:col-span-12">
              <p className={eyebrowClass}>Lyon, France</p>
              <h1 className="mt-3 text-[30px] font-semibold leading-[1.02] tracking-[-0.02em] lg:text-[40px]">
                A short catalogue of hi-fi equipment.
              </h1>
              <Link
                href="#new-this-month"
                className={`${primaryButtonClass} mt-6`}
              >
                Browse new arrivals
              </Link>
            </div>
          )}
        </Container>
      </section>

      <section id="new-this-month" className="scroll-mt-16 border-t border-rule">
        <Container className="py-8">
          <div className="flex items-baseline justify-between gap-6 pb-3">
            <h2 className={sectionTitleClass}>New this month</h2>
            <p className="text-[13px] uppercase tracking-[0.14em] text-muted">
              Eight recent additions
            </p>
          </div>
          <div className="mt-3">
            <ProductGrid products={newProducts} />
          </div>
        </Container>
      </section>

      <section className="border-t border-rule">
        <Container className="py-8 lg:py-10">
          <div className="flex items-baseline justify-between gap-6 pb-3">
            <h2 className={sectionTitleClass}>Shop by category</h2>
            <p className="text-[13px] uppercase tracking-[0.14em] text-muted">
              Four departments
            </p>
          </div>

          <div className="mt-6 grid grid-cols-2 gap-x-6 gap-y-8 lg:grid-cols-4 lg:gap-x-8">
            {categoryTiles.map((category) => (
              <Link
                key={category.slug}
                href={`/c/${category.slug}`}
                className="group block"
              >
                <div className="relative aspect-square overflow-hidden bg-surface">
                  {category.image !== null ? (
                    <Image
                      src={category.image.url}
                      alt={category.image.alt}
                      fill
                      sizes="(max-width: 767px) 50vw, 25vw"
                      className="object-cover transition-opacity duration-200 group-hover:opacity-80"
                    />
                  ) : (
                    <div className="flex h-full items-center justify-center text-[13px] text-muted">
                      Image unavailable
                    </div>
                  )}
                </div>
                <div className="mt-3 flex min-h-6 items-baseline justify-between gap-3">
                  <h3 className="text-[15px] font-medium leading-5 tracking-[-0.02em] text-ink">
                    {category.name}
                  </h3>
                  <p className="text-[13px] leading-5 tabular-nums text-muted">
                    {category.count}
                  </p>
                </div>
              </Link>
            ))}
          </div>
        </Container>
      </section>

      <section className="border-t border-rule">
        <Container className="grid gap-6 py-8 lg:grid-cols-12 lg:gap-12 lg:py-10">
          <p className={cn(eyebrowClass, "lg:col-span-3")}>The shop</p>
          <p className="max-w-[65ch] text-[15px] leading-6 text-ink lg:col-span-7">
            Kestrel Audio is a small hi-fi shop in Lyon, France. We keep a
            short catalogue of headphones, speakers, turntables and accessories,
            and ship from our warehouse to addresses in France and the European
            Union. Orders placed before 14:00 Central European Time on a weekday
            leave the same day.
          </p>
        </Container>
      </section>
    </div>
  );
}
