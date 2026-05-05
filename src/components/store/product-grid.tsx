import type { ProductCardModel } from "@/lib/catalog";
import { cn } from "@/lib/utils";

import { ProductCard } from "./product-card";

export function ProductGrid({
  products,
  className,
}: {
  products: ProductCardModel[];
  className?: string;
}) {
  return (
    <div
      className={cn(
        "grid grid-cols-2 gap-x-6 gap-y-10 md:grid-cols-3 lg:grid-cols-4 lg:gap-x-8 lg:gap-y-14",
        className,
      )}
    >
      {products.map((product) => (
        <ProductCard key={product.slug} product={product} />
      ))}
    </div>
  );
}
