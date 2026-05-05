import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { firstParam, requireAdmin } from "@/lib/admin";
import { specRowsFromJson } from "@/lib/admin-products";
import { db } from "@/lib/db";
import { isUuid } from "@/lib/ids";
import {
  eyebrowClass,
  fieldClass,
  labelClass,
  pageTitleClass,
  primaryButtonClass,
  sectionTitleClass,
  textLinkClass,
} from "@/lib/styles";
import { cn } from "@/lib/utils";

import {
  saveProductDetailsAction,
  saveProductImagesAction,
  saveProductSpecsAction,
  saveProductVariantsAction,
} from "../actions";

export const metadata: Metadata = {
  title: "Product",
};

interface AdminProductPageProps {
  params: Promise<{ id: string }>;
  searchParams: Promise<{
    saved?: string | string[];
    error?: string | string[];
  }>;
}

export default async function AdminProductPage({
  params,
  searchParams,
}: AdminProductPageProps) {
  const [{ id }, query] = await Promise.all([params, searchParams]);
  await requireAdmin(`/admin/products/${id}`);

  if (!isUuid(id)) {
    notFound();
  }

  const product = await db.product.findUnique({
    where: { id },
    include: {
      brand: { select: { name: true } },
      category: { select: { name: true } },
      variants: {
        orderBy: { position: "asc" },
        select: {
          id: true,
          title: true,
          sku: true,
          priceCents: true,
          stock: true,
        },
      },
      images: {
        orderBy: { position: "asc" },
        select: { id: true, url: true, alt: true, position: true },
      },
    },
  });

  if (product === null) {
    notFound();
  }

  const saved = firstParam(query.saved) ?? null;
  const error = firstParam(query.error) ?? null;

  const specRows = specRowsFromJson(product.specs);
  const specRowsForForm = [
    ...specRows,
    ...Array.from({ length: 4 }, () => ({ key: "", value: "" })),
  ];

  return (
    <div>
      <Link
        href="/admin/products"
        className={cn("text-[13px] text-ink/55", textLinkClass)}
      >
        Back to products
      </Link>

      <div className="mt-6 flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className={eyebrowClass}>{product.brand.name}</p>
          <h1 className={cn(pageTitleClass, "mt-2")}>{product.title}</h1>
          <p className="mt-3 text-[13px] leading-5 text-ink/55">
            {product.category.name} · {product.variants.length}{" "}
            {product.variants.length === 1 ? "variant" : "variants"}
          </p>
        </div>
        <span className="inline-flex border border-rule px-3 py-1 text-[11px] uppercase leading-4 tracking-[0.14em] text-ink/60">
          {product.status}
        </span>
      </div>

      {error !== null ? (
        <p
          role="alert"
          className="mt-6 border-l-2 border-accent pl-3 text-[13px] leading-5 text-accent"
        >
          {error}
        </p>
      ) : null}
      {saved !== null ? (
        <p className="mt-6 border-l-2 border-rule pl-3 text-[13px] leading-5 text-ink/60">
          Saved.
        </p>
      ) : null}

      <section className="mt-10 border-t border-rule pt-8">
        <h2 className={sectionTitleClass}>Details</h2>
        <form
          action={saveProductDetailsAction}
          className="mt-5 flex flex-col gap-4"
        >
          <input type="hidden" name="productId" value={product.id} />

          <div className="flex flex-col gap-2">
            <label htmlFor="product-title" className={labelClass}>
              Title
            </label>
            <input
              id="product-title"
              name="title"
              type="text"
              defaultValue={product.title}
              required
              maxLength={200}
              className={fieldClass}
            />
          </div>

          <div className="flex flex-col gap-2">
            <label htmlFor="product-description" className={labelClass}>
              Description
            </label>
            <textarea
              id="product-description"
              name="description"
              defaultValue={product.description}
              rows={6}
              maxLength={5_000}
              className={cn(fieldClass, "h-auto min-h-[160px] py-3")}
            />
          </div>

          <div>
            <button type="submit" className={primaryButtonClass}>
              Save details
            </button>
          </div>
        </form>
      </section>

      <section className="mt-12 border-t border-rule pt-8">
        <h2 className={sectionTitleClass}>Specifications</h2>
        <p className="mt-2 text-[13px] leading-5 text-ink/55">
          Clear a row to remove it. Blank rows are ignored.
        </p>

        <form action={saveProductSpecsAction} className="mt-5">
          <input type="hidden" name="productId" value={product.id} />

          <div className="overflow-x-auto">
            <table className="w-full min-w-[560px] border-collapse text-left">
              <caption className="sr-only">Specification rows</caption>
              <thead>
                <tr className="border-b border-rule text-[11px] uppercase leading-4 tracking-[0.12em] text-ink/50">
                  <th scope="col" className="py-3 pr-4 font-medium">
                    Name
                  </th>
                  <th scope="col" className="py-3 font-medium">
                    Value
                  </th>
                </tr>
              </thead>
              <tbody>
                {specRowsForForm.map((row, index) => (
                  <tr key={`spec-${index}`} className="border-b border-rule">
                    <td className="py-3 pr-4">
                      <input
                        type="text"
                        name="specKey"
                        defaultValue={row.key}
                        aria-label={`Specification name ${index + 1}`}
                        maxLength={80}
                        className={fieldClass}
                      />
                    </td>
                    <td className="py-3">
                      <input
                        type="text"
                        name="specValue"
                        defaultValue={row.value}
                        aria-label={`Specification value ${index + 1}`}
                        maxLength={300}
                        className={fieldClass}
                      />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="mt-4">
            <button type="submit" className={primaryButtonClass}>
              Save specifications
            </button>
          </div>
        </form>
      </section>

      <section className="mt-12 border-t border-rule pt-8">
        <h2 className={sectionTitleClass}>Variants</h2>
        <p className="mt-2 text-[13px] leading-5 text-ink/55">
          Prices are integer cents. Changing a price does not change an existing
          order.
        </p>

        <form action={saveProductVariantsAction} className="mt-5">
          <input type="hidden" name="productId" value={product.id} />

          <div className="overflow-x-auto">
            <table className="w-full min-w-[640px] border-collapse text-left">
              <caption className="sr-only">Variant prices and stock</caption>
              <thead>
                <tr className="border-b border-rule text-[11px] uppercase leading-4 tracking-[0.12em] text-ink/50">
                  <th scope="col" className="py-3 pr-4 font-medium">
                    Variant
                  </th>
                  <th scope="col" className="py-3 pr-4 font-medium">
                    SKU
                  </th>
                  <th scope="col" className="py-3 pr-4 font-medium">
                    Price (cents)
                  </th>
                  <th scope="col" className="py-3 font-medium">
                    Stock
                  </th>
                </tr>
              </thead>
              <tbody>
                {product.variants.map((variant) => (
                  <tr key={variant.id} className="border-b border-rule">
                    <td className="py-3 pr-4 text-[13px] text-ink/70">
                      {variant.title}
                      <input
                        type="hidden"
                        name="variantId"
                        value={variant.id}
                      />
                    </td>
                    <td className="py-3 pr-4 text-[12px] tabular-nums text-ink/45">
                      {variant.sku}
                    </td>
                    <td className="py-3 pr-4">
                      <input
                        type="number"
                        name="priceCents"
                        min={0}
                        step={1}
                        defaultValue={variant.priceCents}
                        aria-label={`Price in cents for ${variant.sku}`}
                        className={cn(fieldClass, "w-36 text-right")}
                      />
                    </td>
                    <td className="py-3">
                      <input
                        type="number"
                        name="stock"
                        min={0}
                        step={1}
                        defaultValue={variant.stock}
                        aria-label={`Stock for ${variant.sku}`}
                        className={cn(fieldClass, "w-28 text-right")}
                      />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="mt-4">
            <button type="submit" className={primaryButtonClass}>
              Save variants
            </button>
          </div>
        </form>
      </section>

      <section className="mt-12 border-t border-rule pt-8">
        <h2 className={sectionTitleClass}>Images</h2>
        <p className="mt-2 text-[13px] leading-5 text-ink/55">
          Positions sort ascending. The first image is the card image.
        </p>

        {product.images.length === 0 ? (
          <p className="mt-5 text-[13px] leading-5 text-ink/55">
            No images.
          </p>
        ) : (
          <form action={saveProductImagesAction} className="mt-5">
            <input type="hidden" name="productId" value={product.id} />

            <ul className="flex flex-col divide-y divide-rule border-y border-rule">
              {product.images.map((image) => (
                <li
                  key={image.id}
                  className="flex flex-wrap items-center gap-4 py-4"
                >
                  <img
                    src={image.url}
                    alt={image.alt}
                    className="h-16 w-16 border border-rule object-cover"
                  />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-[13px] leading-5 text-ink/70">
                      {image.url}
                    </p>
                    <p className="mt-1 text-[12px] leading-4 text-ink/45">
                      {image.alt}
                    </p>
                  </div>
                  <label className="flex items-center gap-2 text-[11px] uppercase leading-4 tracking-[0.14em] text-ink/55">
                    Position
                    <input
                      type="number"
                      name={`position_${image.id}`}
                      min={0}
                      step={1}
                      defaultValue={image.position}
                      className={cn(fieldClass, "w-24 text-right")}
                    />
                  </label>
                </li>
              ))}
            </ul>

            <div className="mt-4">
              <button type="submit" className={primaryButtonClass}>
                Save image order
              </button>
            </div>
          </form>
        )}
      </section>
    </div>
  );
}
