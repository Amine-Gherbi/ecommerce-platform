import Image from "next/image";
import Link from "next/link";

import type { ProductCardModel } from "@/lib/catalog";

export function ProductCard({ product }: { product: ProductCardModel }) {
  return (
    <article className="group">
      <Link href={`/p/${product.slug}`} className="block">
        <div className="relative aspect-[4/5] overflow-hidden border border-rule bg-surface">
          {product.image !== null ? (
            <Image
              src={product.image.url}
              alt={product.image.alt}
              fill
              sizes="(max-width: 767px) 50vw, (max-width: 1023px) 33vw, 25vw"
              className="object-cover transition-transform duration-500 ease-out group-hover:scale-[1.015]"
            />
          ) : (
            <div className="flex h-full items-center justify-center px-4 text-center text-[13px] text-ink/40">
              Image unavailable
            </div>
          )}
        </div>

        <div className="mt-3 flex flex-col gap-1">
          <p className="text-[11px] uppercase leading-4 tracking-[0.14em] text-ink/50">
            {product.brandName}
          </p>
          <h3 className="text-[14px] leading-5 text-ink transition-colors group-hover:text-ink/75">
            {product.title}
          </h3>
          <p className="text-[14px] leading-5 tabular-nums text-ink">
            {product.pricePrefix}
            {product.price}
          </p>
          {!product.inStock ? (
            <p className="text-[11px] uppercase leading-4 tracking-[0.14em] text-ink/45">
              Sold out
            </p>
          ) : null}
        </div>
      </Link>
    </article>
  );
}
