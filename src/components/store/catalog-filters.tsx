import Link from "next/link";

import {
  PRICE_BANDS,
  type CatalogFilters as CatalogFiltersValue,
} from "@/lib/catalog-shared";
import {
  labelClass,
  primaryButtonClass,
  textLinkClass,
} from "@/lib/styles";
import { cn } from "@/lib/utils";

const optionClass =
  "flex min-h-11 cursor-pointer items-center gap-3 text-[13px] leading-5 text-ink";

export function CatalogFilters({
  action,
  brands,
  filters,
}: {
  action: string;
  brands: { slug: string; name: string }[];
  filters: CatalogFiltersValue;
}) {
  return (
    <form action={action} method="get" className="flex flex-col gap-7">
      {filters.sort !== "newest" ? (
        <input type="hidden" name="sort" value={filters.sort} />
      ) : null}

      <fieldset>
        <legend className={labelClass}>Brand</legend>
        <div className="mt-2 flex flex-col">
          {brands.map((brand) => (
            <label key={brand.slug} className={optionClass}>
              <input
                type="checkbox"
                name="brand"
                value={brand.slug}
                defaultChecked={filters.brands.includes(brand.slug)}
                className="size-4 accent-accent"
              />
              <span>{brand.name}</span>
            </label>
          ))}
        </div>
      </fieldset>

      <fieldset className="border-t border-rule pt-5">
        <legend className={cn(labelClass, "pt-5")}>Price</legend>
        <div className="flex flex-col">
          <label className={optionClass}>
            <input
              type="radio"
              name="band"
              value=""
              defaultChecked={filters.band === ""}
              className="size-4 accent-accent"
            />
            <span>All prices</span>
          </label>
          {PRICE_BANDS.map((band) => (
            <label key={band.id} className={optionClass}>
              <input
                type="radio"
                name="band"
                value={band.id}
                defaultChecked={filters.band === band.id}
                className="size-4 accent-accent"
              />
              <span>{band.label}</span>
            </label>
          ))}
        </div>
      </fieldset>

      <fieldset className="border-t border-rule pt-5">
        <legend className={cn(labelClass, "pt-5")}>Availability</legend>
        <label className={optionClass}>
          <input
            type="checkbox"
            name="stock"
            value="1"
            defaultChecked={filters.inStock}
            className="size-4 accent-accent"
          />
          <span>In stock only</span>
        </label>
      </fieldset>

      <div className="flex flex-col gap-4 border-t border-rule pt-6">
        <button type="submit" className={primaryButtonClass}>
          Apply filters
        </button>
        <Link
          href={action}
          className={cn(
            "inline-flex min-h-11 items-center text-[13px] uppercase tracking-[0.14em] text-muted",
            textLinkClass,
          )}
        >
          Clear filters
        </Link>
      </div>
    </form>
  );
}
