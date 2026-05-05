import Image from "next/image";
import Link from "next/link";

import type { ProductCardModel } from "@/lib/catalog";

export function ProductCard({ product }: { product: ProductCardModel }) {
  return (
    <article className="group">
      <Link href={`/p/${product.slug}`} className="block">
        <div className="relative aspect-square overflow-hidden bg-surface">
          {product.image !== null ? (
            <Image
              src={product.image.url}
              alt={product.image.alt}
              fill
              sizes="(max-width: 767px) 50vw, (max-width: 1023px) 33vw, 25vw"
              className="object-cover transition-opacity duration-200 group-hover:opacity-80"
            />
          ) : (
            <div className="flex h-full items-center justify-center px-4 text-center text-[13px] text-muted">
              Image unavailable
            </div>
          )}
        </div>

        <div className="mt-3 flex flex-col gap-1">
          <p className="text-[11px] font-semibold uppercase leading-4 tracking-[0.14em] text-muted">
            {product.brandName}
          </p>
          <h3 className="text-[15px] font-medium leading-5 text-ink">
            {product.title}
          </h3>
          <p className="text-[15px] font-semibold leading-5 tabular-nums text-ink">
            {product.pricePrefix}
            {product.price}
          </p>
          {!product.inStock ? (
            <p className="text-[11px] font-semibold uppercase leading-4 tracking-[0.14em] text-muted">
              Sold out
            </p>
          ) : null}
        </div>
      </Link>
    </article>
  );
}
