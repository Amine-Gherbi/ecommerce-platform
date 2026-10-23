import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { AddToCart } from "@/components/store/add-to-cart";
import { Gallery } from "@/components/store/gallery";
import { ProductGrid } from "@/components/store/product-grid";
import { VariantPicker } from "@/components/store/variant-picker";
import { Breadcrumbs, Container } from "@/components/store/ui";
import { getProductPageData } from "@/lib/catalog";
import { shippingRuleCopy } from "@/lib/money";
import { eyebrowClass, sectionTitleClass } from "@/lib/styles";

interface ProductPageProps {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ variant?: string | string[] }>;
}

function firstValue(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

export async function generateMetadata({
  params,
  searchParams,
}: ProductPageProps): Promise<Metadata> {
  const [{ slug }, query] = await Promise.all([params, searchParams]);
  const data = await getProductPageData(slug, firstValue(query.variant));

  if (data === null) {
    return { title: "Product not found" };
  }

  return {
    title: data.title,
    description: data.description,
  };
}

export default async function ProductPage({
  params,
  searchParams,
}: ProductPageProps) {
  const [{ slug }, query] = await Promise.all([params, searchParams]);
  const data = await getProductPageData(slug, firstValue(query.variant));

  if (data === null) {
    notFound();
  }

  return (
    <div>
      <Container className="py-8 lg:py-12">
        <Breadcrumbs
          items={[
            { label: "Home", href: "/" },
            {
              label: data.categoryName,
              href: `/c/${data.categorySlug}`,
            },
            { label: data.title },
          ]}
        />

        <div className="mt-8 grid gap-10 lg:mt-10 lg:grid-cols-2 lg:gap-16">
          <Gallery key={data.slug} images={data.images} title={data.title} />

          <div className="lg:sticky lg:top-28 lg:self-start">
            <p className={eyebrowClass}>{data.brandName}</p>
            <h1 className="mt-3 text-[28px] font-medium leading-[1.12] tracking-[-0.02em] text-ink lg:text-[40px]">
              {data.title}
            </h1>
            <p className="mt-5 text-[20px] leading-7 text-accent lg:text-[28px] lg:leading-9">
              {data.selectedVariant.price}
            </p>

            <p className="mt-5 max-w-[52ch] text-[14px] leading-6 text-ink/65">
              {data.description}
            </p>

            <div className="mt-8 flex flex-col gap-5 border-t border-rule pt-6">
              <VariantPicker
                productSlug={data.slug}
                selectedId={data.selectedVariant.id}
                variants={data.variants}
              />

              <div className="flex items-center justify-between gap-4 text-[13px] leading-5">
                <span className="text-ink/55">Availability</span>
                <span className="text-ink">
                  {data.selectedVariant.inStock ? "In stock" : "Sold out"}
                </span>
              </div>

              <AddToCart
                key={data.selectedVariant.id}
                variantId={data.selectedVariant.id}
                maxQuantity={data.selectedVariant.maxQuantity}
                soldOut={!data.selectedVariant.inStock}
              />

              <p className="max-w-[52ch] text-[13px] leading-5 text-ink/50">
                Ships from Lyon, France. {shippingRuleCopy()}
              </p>
            </div>
          </div>
        </div>

        {data.specs.length > 0 ? (
          <section className="mt-14 border-t border-rule pt-10 lg:mt-20 lg:pt-12">
            <div className="grid gap-8 lg:grid-cols-12 lg:gap-12">
              <h2 className={`${sectionTitleClass} lg:col-span-3`}>
                Specifications
              </h2>
              <dl className="divide-y divide-rule border-t border-rule lg:col-span-7">
                {data.specs.map((spec) => (
                  <div
                    key={spec.label}
                    className="grid grid-cols-[minmax(0,1fr)_minmax(0,1.5fr)] gap-4 py-3 text-[13px] leading-5"
                  >
                    <dt className="text-ink/55">{spec.label}</dt>
                    <dd className="text-ink">{spec.value}</dd>
                  </div>
                ))}
              </dl>
            </div>
          </section>
        ) : null}

        {data.related.length > 0 ? (
          <section className="mt-14 border-t border-rule pt-10 lg:mt-20 lg:pt-12">
            <div className="flex items-baseline justify-between gap-6">
              <h2 className={sectionTitleClass}>Related products</h2>
              <Link
                href={`/c/${data.categorySlug}`}
                className="text-[13px] text-ink/55 underline decoration-rule underline-offset-4 hover:text-ink hover:decoration-ink"
              >
                All {data.categoryName.toLowerCase()}
              </Link>
            </div>
            <div className="mt-8">
              <ProductGrid
                products={data.related}
                className="md:grid-cols-3 lg:grid-cols-3"
              />
            </div>
          </section>
        ) : null}
      </Container>
    </div>
  );
}
