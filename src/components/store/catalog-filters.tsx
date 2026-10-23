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
        <div className="mt-3 flex flex-col gap-2.5">
          {brands.map((brand) => (
            <label
              key={brand.slug}
              className="flex cursor-pointer items-center gap-2.5 text-[13px] leading-5 text-ink/75"
            >
              <input
                type="checkbox"
                name="brand"
                value={brand.slug}
                defaultChecked={filters.brands.includes(brand.slug)}
                className="size-3.5 accent-ink"
              />
              <span>{brand.name}</span>
            </label>
          ))}
        </div>
      </fieldset>

      <fieldset className="border-t border-rule pt-6">
        <legend className={cn(labelClass, "pt-6")}>Price</legend>
        <div className="flex flex-col gap-2.5">
          <label className="flex cursor-pointer items-center gap-2.5 text-[13px] leading-5 text-ink/75">
            <input
              type="radio"
              name="band"
              value=""
              defaultChecked={filters.band === ""}
              className="size-3.5 accent-ink"
            />
            <span>All prices</span>
          </label>
          {PRICE_BANDS.map((band) => (
            <label
              key={band.id}
              className="flex cursor-pointer items-center gap-2.5 text-[13px] leading-5 text-ink/75"
            >
              <input
                type="radio"
                name="band"
                value={band.id}
                defaultChecked={filters.band === band.id}
                className="size-3.5 accent-ink"
              />
              <span>{band.label}</span>
            </label>
          ))}
        </div>
      </fieldset>

      <fieldset className="border-t border-rule pt-6">
        <legend className={cn(labelClass, "pt-6")}>Availability</legend>
        <label className="flex cursor-pointer items-center gap-2.5 text-[13px] leading-5 text-ink/75">
          <input
            type="checkbox"
            name="stock"
            value="1"
            defaultChecked={filters.inStock}
            className="size-3.5 accent-ink"
          />
          <span>In stock only</span>
        </label>
      </fieldset>

      <div className="flex flex-col gap-4 border-t border-rule pt-6">
        <button type="submit" className={primaryButtonClass}>
          Apply filters
        </button>
        <Link href={action} className={cn("text-[13px] text-ink/65", textLinkClass)}>
          Clear filters
        </Link>
      </div>
    </form>
  );
}
