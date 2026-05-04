import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { pageWindow, Pagination } from "@/components/pagination";
import { catalogHref, parseCatalogParams } from "@/lib/catalog-params";

describe("Pagination", () => {
  it("keeps filters and page size in every href and marks the current page", () => {
    const params = parseCatalogParams({
      q: "canvas",
      category: "apparel",
      minCents: "2000",
      maxCents: "9000",
      pageSize: "24",
      page: "2",
    });

    const html = renderToStaticMarkup(
      <Pagination
        page={2}
        pageSize={24}
        total={72}
        hrefForPage={(page) => catalogHref(params, { page })}
      />,
    );

    expect(html).toContain("Page 2 of 3");
    expect(html).toContain('aria-current="page"');

    const hrefs = [...html.matchAll(/href="([^"]+)"/g)].map((match) =>
      (match[1] ?? "").replaceAll("&amp;", "&"),
    );
    expect(hrefs).toContain(catalogHref(params, { page: 3 }));
    expect(hrefs).toContain(catalogHref(params, { page: 1 }));

    for (const href of hrefs) {
      expect(href).toContain("q=canvas");
      expect(href).toContain("category=apparel");
      expect(href).toContain("pageSize=24");
    }
  });

  it("never renders more than five page links", () => {
    expect(pageWindow(1, 1)).toEqual([1]);
    expect(pageWindow(5, 10)).toEqual([3, 4, 5, 6, 7]);
    expect(pageWindow(10, 10)).toEqual([6, 7, 8, 9, 10]);
    expect(pageWindow(1, 10)).toEqual([1, 2, 3, 4, 5]);
  });
});
