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
        <Container className="grid gap-8 py-8 lg:grid-cols-12 lg:items-center lg:gap-12 lg:py-10">
          {hero !== null ? (
            <>
              <div className="lg:col-span-6">
                <p className={eyebrowClass}>
                  Featured · {hero.categoryName}
                </p>
                <h1 className="mt-4 max-w-[20ch] text-[32px] font-medium leading-[1.06] tracking-[-0.02em] text-ink lg:text-[44px]">
                  {hero.title}
                </h1>
                <p className="mt-4 text-[24px] leading-8 tabular-nums text-ink lg:text-[28px] lg:leading-9">
                  {hero.pricePrefix}
                  {hero.price}
                </p>
                <p className="mt-4 max-w-[42ch] text-[14px] leading-6 text-ink/65">
                  {hero.inStock ? "In stock now." : "Currently sold out."} From
                  the {hero.brandName} range, shipped from our warehouse in
                  Lyon with the total confirmed by the server.
                </p>
                <div className="mt-7 flex flex-wrap items-center gap-x-6 gap-y-3">
                  <Link
                    href={`/p/${hero.slug}`}
                    className={primaryButtonClass}
                  >
                    Shop this product
                  </Link>
                  <Link
                    href="#new-this-month"
                    className={cn("text-[13px] text-ink/65", textLinkClass)}
                  >
                    See new arrivals
                  </Link>
                </div>
              </div>

              <div className="lg:col-span-6">
                <Link href={`/p/${hero.slug}`} className="group block">
                  <div className="relative aspect-[16/9] overflow-hidden border border-rule bg-surface">
                    {hero.image !== null ? (
                      <Image
                        src={hero.image.url}
                        alt={hero.image.alt}
                        fill
                        priority
                        sizes="(max-width: 1023px) 100vw, 50vw"
                        className="object-cover transition-transform duration-700 ease-out group-hover:scale-[1.01]"
                      />
                    ) : (
                      <div className="flex h-full items-center justify-center text-[13px] text-ink/40">
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
              <h1 className="mt-4 text-[32px] font-medium leading-[1.08] tracking-[-0.02em] lg:text-[44px]">
                A short catalogue of hi-fi equipment.
              </h1>
              <Link
                href="#new-this-month"
                className={`${primaryButtonClass} mt-7`}
              >
                Browse new arrivals
              </Link>
            </div>
          )}
        </Container>
      </section>

      <section id="new-this-month" className="scroll-mt-24">
        <Container className="py-10 lg:py-12">
          <div className="flex items-baseline justify-between gap-6 border-b border-rule pb-4">
            <h2 className={sectionTitleClass}>New this month</h2>
            <p className="text-[13px] text-ink/45">Eight recent additions</p>
          </div>
          <div className="mt-6">
            <ProductGrid products={newProducts} />
          </div>
        </Container>
      </section>

      <section className="border-t border-rule">
        <Container className="py-10 lg:py-14">
          <div className="flex items-baseline justify-between gap-6 border-b border-rule pb-4">
            <h2 className={sectionTitleClass}>Shop by category</h2>
            <p className="text-[13px] text-ink/45">Four departments</p>
          </div>

          <div className="mt-8 grid grid-cols-2 gap-x-6 gap-y-10 lg:grid-cols-4 lg:gap-x-8">
            {categoryTiles.map((category) => (
              <Link
                key={category.slug}
                href={`/c/${category.slug}`}
                className="group block"
              >
                <div className="relative aspect-[4/3] overflow-hidden border border-rule bg-surface">
                  {category.image !== null ? (
                    <Image
                      src={category.image.url}
                      alt={category.image.alt}
                      fill
                      sizes="(max-width: 767px) 50vw, 25vw"
                      className="object-cover transition-transform duration-500 ease-out group-hover:scale-[1.015]"
                    />
                  ) : (
                    <div className="flex h-full items-center justify-center text-[13px] text-ink/40">
                      Image unavailable
                    </div>
                  )}
                </div>
                <div className="mt-3 flex items-baseline justify-between gap-3">
                  <h3 className="text-[14px] leading-5 text-ink transition-colors group-hover:text-ink/70">
                    {category.name}
                  </h3>
                  <p className="text-[13px] leading-5 text-ink/45">
                    {category.count}
                  </p>
                </div>
              </Link>
            ))}
          </div>
        </Container>
      </section>

      <section className="border-t border-rule">
        <Container className="grid gap-6 py-10 lg:grid-cols-12 lg:gap-12 lg:py-14">
          <p className={cn(eyebrowClass, "lg:col-span-3")}>The shop</p>
          <p className="max-w-[65ch] text-[16px] leading-7 text-ink/70 lg:col-span-7">
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
