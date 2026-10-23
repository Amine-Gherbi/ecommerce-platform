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
        <Container className="grid gap-10 py-10 lg:grid-cols-12 lg:items-end lg:gap-12 lg:py-16">
          <div className="lg:col-span-5 lg:pb-2">
            <p className={eyebrowClass}>Lyon, France</p>
            <h1 className="mt-5 max-w-[19ch] text-[28px] font-medium leading-[1.08] tracking-[-0.02em] text-ink lg:text-[40px]">
              A short catalogue of{" "}
              <span className="whitespace-nowrap">hi-fi</span> equipment.
            </h1>
            <p className="mt-5 max-w-[42ch] text-[16px] leading-7 text-ink/65">
              Headphones, speakers, turntables and the parts that connect them.
              Prices are in euros, and every order ships from our warehouse in
              Lyon.
            </p>
            <div className="mt-8 flex flex-wrap items-center gap-6">
              <Link href="#new-this-month" className={primaryButtonClass}>
                Browse new arrivals
              </Link>
              <Link
                href="/c/headphones"
                className={cn("text-[13px] text-ink/70", textLinkClass)}
              >
                Shop headphones
              </Link>
            </div>
          </div>

          <div className="lg:col-span-7">
            {hero !== null ? (
              <>
                <Link href={`/p/${hero.slug}`} className="group block">
                  <div className="relative aspect-[4/3] overflow-hidden border border-rule bg-surface lg:aspect-[5/4]">
                    {hero.image !== null ? (
                      <Image
                        src={hero.image.url}
                        alt={hero.image.alt}
                        fill
                        priority
                        sizes="(max-width: 1023px) 100vw, 58vw"
                        className="object-cover transition-transform duration-700 ease-out group-hover:scale-[1.01]"
                      />
                    ) : (
                      <div className="flex h-full items-center justify-center text-[13px] text-ink/40">
                        Image unavailable
                      </div>
                    )}
                  </div>
                </Link>
                <div className="mt-3 flex flex-wrap items-baseline justify-between gap-3 text-[13px] leading-5">
                  <p className="text-ink/55">Shown: {hero.title}</p>
                  <Link
                    href={`/p/${hero.slug}`}
                    className="text-accent underline decoration-rule underline-offset-4 transition-colors hover:decoration-accent"
                  >
                    {hero.pricePrefix}
                    {hero.price}
                  </Link>
                </div>
              </>
            ) : null}
          </div>
        </Container>
      </section>

      <section>
        <Container className="py-12 lg:py-20">
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

      <section
        id="new-this-month"
        className="scroll-mt-28 border-t border-rule"
      >
        <Container className="py-12 lg:py-20">
          <div className="flex items-baseline justify-between gap-6 border-b border-rule pb-4">
            <h2 className={sectionTitleClass}>New this month</h2>
            <p className="text-[13px] text-ink/45">Eight recent additions</p>
          </div>
          <div className="mt-8">
            <ProductGrid products={newProducts} />
          </div>
        </Container>
      </section>

      <section className="border-t border-rule">
        <Container className="grid gap-6 py-12 lg:grid-cols-12 lg:gap-12 lg:py-20">
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
