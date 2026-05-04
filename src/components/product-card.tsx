import Link from "next/link";

import { Badge } from "@/components/ui/badge";
import { formatCents } from "@/lib/format";

export interface ProductCardProduct {
  slug: string;
  name: string;
  description: string;
  categoryName: string;
  minPriceCents: number;
  variantCount: number;
}

export interface ProductCardProps {
  product: ProductCardProduct;
}

export function ProductCard({ product }: ProductCardProps) {
  return (
    <article className="group flex h-full flex-col rounded-xl border bg-card shadow-sm transition-shadow hover:shadow-md">
      <Link
        href={`/products/${product.slug}`}
        className="flex h-full flex-col p-5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        <div className="flex items-center justify-between gap-2">
          <Badge variant="secondary">{product.categoryName}</Badge>
          <span className="text-xs text-muted-foreground">
            {product.variantCount} {product.variantCount === 1 ? "variant" : "variants"}
          </span>
        </div>
        <h2 className="mt-4 text-base font-semibold leading-snug group-hover:underline">
          {product.name}
        </h2>
        <p className="mt-2 line-clamp-3 text-sm text-muted-foreground">
          {product.description}
        </p>
        <div className="mt-auto flex items-baseline justify-between pt-4">
          <span className="text-sm text-muted-foreground">From</span>
          <span className="font-semibold tabular-nums">
            {formatCents(product.minPriceCents)}
          </span>
        </div>
      </Link>
    </article>
  );
}
