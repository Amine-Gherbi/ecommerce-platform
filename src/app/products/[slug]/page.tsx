import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { cache } from "react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { getProductBySlug, listProductSlugs } from "@/lib/catalog";
import {
  catalogHref,
  DEFAULT_CATALOG_PARAMS,
} from "@/lib/catalog-params";
import { formatCents } from "@/lib/format";

// Product copy and variant prices change rarely; stock is read from Postgres on
// every revalidation so the PDP shows real availability rather than build-time
// values. M3/M4 mutations (reservation, commit, release) should call
// revalidatePath(`/products/${slug}`) so buyers do not wait out the window.
export const revalidate = 30;

const productBySlug = cache(getProductBySlug);

export async function generateStaticParams(): Promise<Array<{ slug: string }>> {
  const slugs = await listProductSlugs();
  return slugs.map((slug) => ({ slug }));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const product = await productBySlug(slug);

  if (product === null) {
    return { title: "Product not found" };
  }

  return {
    title: product.name,
    description: product.description,
  };
}

export default async function ProductPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const product = await productBySlug(slug);

  if (product === null) {
    notFound();
  }

  const minPriceCents =
    product.variants.length > 0
      ? Math.min(...product.variants.map((variant) => variant.priceCents))
      : null;
  const totalStock = product.variants.reduce(
    (sum, variant) => sum + variant.stock,
    0,
  );

  return (
    <main className="mx-auto w-full max-w-6xl px-4 py-8">
      <nav aria-label="Breadcrumb" className="text-sm text-muted-foreground">
        <Link href="/" className="hover:underline">
          Catalog
        </Link>
        <span aria-hidden="true"> / </span>
        <Link
          href={catalogHref(DEFAULT_CATALOG_PARAMS, {
            category: product.category.slug,
          })}
          className="hover:underline"
        >
          {product.category.name}
        </Link>
      </nav>

      <div className="mt-4 grid gap-8 lg:grid-cols-[2fr_1fr]">
        <div>
          <div className="flex flex-wrap items-center gap-3">
            <Badge variant="secondary">{product.category.name}</Badge>
            <span className="text-sm text-muted-foreground">
              {totalStock > 0 ? `${totalStock} units available` : "Out of stock"}
            </span>
          </div>
          <h1 className="mt-3 text-3xl font-semibold tracking-tight">
            {product.name}
          </h1>
          <p className="mt-3 max-w-2xl text-muted-foreground">
            {product.description}
          </p>
          <p className="mt-4 text-lg font-semibold tabular-nums">
            {minPriceCents === null
              ? "Unavailable"
              : `From ${formatCents(minPriceCents)}`}
          </p>
        </div>
      </div>

      <section className="mt-10" aria-labelledby="variants-heading">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h2 id="variants-heading" className="text-xl font-semibold">
            Variants
          </h2>
          <p className="text-xs text-muted-foreground">
            Stock is read from Postgres on every revalidation (30 s).
          </p>
        </div>

        {product.variants.length === 0 ? (
          <p className="mt-4 rounded-xl border border-dashed p-6 text-sm text-muted-foreground">
            This product has no available variants.
          </p>
        ) : (
          <ul className="mt-4 divide-y rounded-xl border bg-card">
            {product.variants.map((variant) => (
              <li
                key={variant.id}
                className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between"
              >
                <div>
                  <p className="font-medium">{variant.name}</p>
                  <p className="text-xs text-muted-foreground">SKU {variant.sku}</p>
                </div>
                <div className="flex flex-wrap items-center gap-4">
                  <span className="font-semibold tabular-nums">
                    {formatCents(variant.priceCents)}
                  </span>
                  <span
                    className={
                      variant.stock > 0
                        ? "text-sm text-muted-foreground"
                        : "text-sm font-medium text-destructive"
                    }
                  >
                    {variant.stock > 0
                      ? `In stock: ${variant.stock}`
                      : "Out of stock"}
                  </span>
                  <Button
                    type="button"
                    disabled
                    aria-describedby="cart-arrives"
                    data-inert-until="m3"
                  >
                    Add to cart
                  </Button>
                </div>
              </li>
            ))}
          </ul>
        )}

        <p
          id="cart-arrives"
          className="mt-4 rounded-lg bg-muted px-4 py-3 text-sm text-muted-foreground"
        >
          <strong className="font-medium text-foreground">Not wired yet.</strong>{" "}
          Add to cart is intentionally inert until M3. The controls are rendered
          disabled: pressing one sends no request and creates no cart row. M3 adds
          the <code>cart_id</code> cookie and the real mutation.
        </p>
      </section>
    </main>
  );
}
