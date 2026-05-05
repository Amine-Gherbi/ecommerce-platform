"use client";

import { useRouter } from "next/navigation";

import { fieldClass, labelClass } from "@/lib/styles";

export function VariantPicker({
  productSlug,
  selectedId,
  variants,
}: {
  productSlug: string;
  selectedId: string;
  variants: { id: string; title: string }[];
}) {
  const router = useRouter();

  function handleChange(nextId: string) {
    router.push(
      `/p/${productSlug}?variant=${encodeURIComponent(nextId)}`,
      { scroll: false },
    );
  }

  return (
    <label className="flex flex-col gap-2">
      <span className={labelClass}>Variant</span>
      <select
        key={selectedId}
        defaultValue={selectedId}
        onChange={(event) => handleChange(event.target.value)}
        className={`${fieldClass} pr-8`}
      >
        {variants.map((variant) => (
          <option key={variant.id} value={variant.id}>
            {variant.title}
          </option>
        ))}
      </select>
    </label>
  );
}
