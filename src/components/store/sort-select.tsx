"use client";

import { useRouter } from "next/navigation";

import { SORT_OPTIONS, type SortKey } from "@/lib/catalog-shared";
import { fieldClass, labelClass } from "@/lib/styles";
import { cn } from "@/lib/utils";

export function SortSelect({
  value,
  basePath,
  baseQuery,
}: {
  value: SortKey;
  basePath: string;
  baseQuery: string;
}) {
  const router = useRouter();

  function handleChange(nextSort: string) {
    const params = new URLSearchParams(baseQuery);
    params.set("sort", nextSort);
    params.delete("page");
    router.push(`${basePath}?${params.toString()}`, { scroll: false });
  }

  return (
    <label className="flex items-center gap-3">
      <span className={labelClass}>Sort</span>
      <select
        key={value}
        defaultValue={value}
        aria-label="Sort products"
        onChange={(event) => handleChange(event.target.value)}
        className={cn(fieldClass, "h-9 w-auto min-w-44 pr-8")}
      >
        {SORT_OPTIONS.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    </label>
  );
}
