import Link from "next/link";

import { Button, buttonVariants } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { NativeSelect } from "@/components/ui/select-native";
import type { CatalogParams } from "@/lib/catalog-params";
import { PAGE_SIZES } from "@/lib/catalog-params";
import type { CategorySummary } from "@/lib/catalog";

export interface FilterFormProps {
  categories: CategorySummary[];
  params: CatalogParams;
}

// A plain GET form: the browser owns the interaction and the server owns the
// result. There is no client component here, so filters work without JS.
export function FilterForm({ categories, params }: FilterFormProps) {
  return (
    <form
      action="/"
      method="get"
      aria-label="Filter products"
      className="mt-6 grid gap-4 rounded-xl border bg-card p-4 sm:grid-cols-2 lg:grid-cols-6"
    >
      <div className="grid gap-1.5 lg:col-span-2">
        <Label htmlFor="q">Search</Label>
        <Input
          id="q"
          name="q"
          type="search"
          defaultValue={params.q ?? ""}
          placeholder="canvas jacket"
          maxLength={120}
        />
      </div>

      <div className="grid gap-1.5">
        <Label htmlFor="category">Category</Label>
        <NativeSelect
          id="category"
          name="category"
          defaultValue={params.category ?? ""}
        >
          <option value="">All categories</option>
          {categories.map((category) => (
            <option key={category.slug} value={category.slug}>
              {category.name}
            </option>
          ))}
        </NativeSelect>
      </div>

      <div className="grid gap-1.5">
        <Label htmlFor="minCents">Min price (cents)</Label>
        <Input
          id="minCents"
          name="minCents"
          type="number"
          inputMode="numeric"
          min={0}
          step={1}
          defaultValue={params.minCents ?? ""}
          placeholder="0"
        />
      </div>

      <div className="grid gap-1.5">
        <Label htmlFor="maxCents">Max price (cents)</Label>
        <Input
          id="maxCents"
          name="maxCents"
          type="number"
          inputMode="numeric"
          min={0}
          step={1}
          defaultValue={params.maxCents ?? ""}
          placeholder="100000"
        />
      </div>

      <div className="grid gap-1.5">
        <Label htmlFor="pageSize">Per page</Label>
        <NativeSelect
          id="pageSize"
          name="pageSize"
          defaultValue={String(params.pageSize)}
        >
          {PAGE_SIZES.map((size) => (
            <option key={size} value={size}>
              {size}
            </option>
          ))}
        </NativeSelect>
      </div>

      {/* Changing a filter starts at page 1; the current page is not carried over. */}
      <input type="hidden" name="page" value="1" />

      <div className="flex items-end gap-2 sm:col-span-2 lg:col-span-6">
        <Button type="submit">Apply filters</Button>
        <Link href="/" className={buttonVariants({ variant: "ghost" })}>
          Clear
        </Link>
        <p className="ml-auto hidden text-xs text-muted-foreground sm:block">
          Prices are filtered on the lowest variant price, in integer cents.
        </p>
      </div>
    </form>
  );
}
