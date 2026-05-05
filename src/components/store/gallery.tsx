"use client";

import Image from "next/image";
import { useState } from "react";

import { focusRing } from "@/lib/styles";
import { cn } from "@/lib/utils";

import type { ProductImageModel } from "@/lib/catalog";

export function Gallery({
  images,
  title,
}: {
  images: ProductImageModel[];
  title: string;
}) {
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [firstImage] = images;
  const selected = images[selectedIndex] ?? firstImage;

  return (
    <div>
      <div className="relative aspect-[4/3] overflow-hidden bg-surface">
        {selected !== undefined ? (
          <Image
            src={selected.url}
            alt={selected.alt}
            fill
            priority
            sizes="(max-width: 1023px) 100vw, 55vw"
            className="object-contain"
          />
        ) : (
          <div className="flex h-full items-center justify-center px-6 text-center text-[13px] text-ink/40">
            Image unavailable for {title}
          </div>
        )}
      </div>

      {images.length > 1 ? (
        <div className="mt-3 grid grid-cols-5 gap-3" aria-label="Product images">
          {images.map((image, index) => (
            <button
              key={`${image.url}-${index}`}
              type="button"
              onClick={() => setSelectedIndex(index)}
              aria-label={`View image ${index + 1} of ${images.length}`}
              aria-pressed={index === selectedIndex}
              className={cn(
                "relative aspect-[4/5] overflow-hidden border bg-surface",
                index === selectedIndex ? "border-ink" : "border-rule",
                focusRing,
              )}
            >
              <Image
                src={image.url}
                alt=""
                fill
                sizes="96px"
                className="object-cover"
              />
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}
