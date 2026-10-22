import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { ProductCard } from "@/components/product-card";

describe("ProductCard", () => {
  it("renders the product URL, category and the cents price formatted once", () => {
    const html = renderToStaticMarkup(
      <ProductCard
        product={{
          slug: "alder-canvas-jacket",
          name: "Alder Canvas Jacket",
          description: "A heavyweight cotton canvas jacket.",
          categoryName: "Apparel",
          minPriceCents: 24_99,
          variantCount: 3,
        }}
      />,
    );

    expect(html).toContain('href="/products/alder-canvas-jacket"');
    expect(html).toContain("Alder Canvas Jacket");
    expect(html).toContain("Apparel");
    expect(html).toContain("3 variants");
    // Cents are formatted exactly once, by the helper; the raw integer is absent.
    expect(html).toContain("$24.99");
    expect(html).not.toContain("24_99");
    expect(html).not.toContain("2499");
  });
});
