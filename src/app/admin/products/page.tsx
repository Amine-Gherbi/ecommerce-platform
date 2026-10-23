import type { Metadata } from "next";
import Link from "next/link";

import type { Prisma, ProductStatus } from "@prisma/client";

import { firstParam, requireAdmin } from "@/lib/admin";
import { db } from "@/lib/db";
import { formatPrice } from "@/lib/money";
import {
  fieldClass,
  pageTitleClass,
  primaryButtonClass,
  textLinkClass,
} from "@/lib/styles";
import { cn } from "@/lib/utils";

import { setProductArchivedAction } from "./actions";

export const metadata: Metadata = {
  title: "Products",
};

const PRODUCT_STATUSES: readonly ProductStatus[] = [
  "DRAFT",
  "ACTIVE",
  "ARCHIVED",
];

const STATUS_LABELS: Record<ProductStatus, string> = {
  DRAFT: "Draft",
  ACTIVE: "Active",
  ARCHIVED: "Archived",
};

function isProductStatus(value: string): value is ProductStatus {
  return (PRODUCT_STATUSES as readonly string[]).includes(value);
}

function priceRange(variants: readonly { priceCents: number }[]): string {
  if (variants.length === 0) {
    return "No variants";
  }

  let minimum = Number.MAX_SAFE_INTEGER;
  let maximum = 0;
  for (const variant of variants) {
    minimum = Math.min(minimum, variant.priceCents);
    maximum = Math.max(maximum, variant.priceCents);
  }

  if (minimum === maximum) {
    return formatPrice(minimum);
  }
  return `${formatPrice(minimum)} – ${formatPrice(maximum)}`;
}

interface AdminProductsPageProps {
  searchParams: Promise<{
    q?: string | string[];
    status?: string | string[];
    saved?: string | string[];
    error?: string | string[];
  }>;
}

export default async function AdminProductsPage({
  searchParams,
}: AdminProductsPageProps) {
  await requireAdmin("/admin/products");

  const query = await searchParams;
  const search = (firstParam(query.q) ?? "").trim().slice(0, 120);
  const statusParam = firstParam(query.status) ?? "";
  const status = isProductStatus(statusParam) ? statusParam : null;
  const saved = firstParam(query.saved) ?? null;
  const error = firstParam(query.error) ?? null;

  const where: Prisma.ProductWhereInput = {};
  if (status !== null) {
    where.status = status;
  }
  if (search.length > 0) {
    where.OR = [
      { title: { contains: search, mode: "insensitive" } },
      { brand: { name: { contains: search, mode: "insensitive" } } },
    ];
  }

  const products = await db.product.findMany({
    where,
    orderBy: { createdAt: "desc" },
    take: 200,
    select: {
      id: true,
      title: true,
      status: true,
      createdAt: true,
      brand: { select: { name: true } },
      variants: { select: { priceCents: true, stock: true } },
    },
  });

  const hasFilters = status !== null || search.length > 0;

  return (
    <div>
      <h1 className={pageTitleClass}>Products</h1>
      <p className="mt-3 text-[13px] leading-5 text-ink/55">
        Archiving removes a product from the storefront. Existing orders keep
        their item snapshots.
      </p>

      {error !== null ? (
        <p
          role="alert"
          className="mt-5 border-l-2 border-accent pl-3 text-[13px] leading-5 text-accent"
        >
          {error}
        </p>
      ) : null}
      {saved === "archived" || saved === "restored" ? (
        <p className="mt-5 border-l-2 border-rule pl-3 text-[13px] leading-5 text-ink/60">
          {saved === "archived" ? "Product archived." : "Product restored."}
        </p>
      ) : null}

      <form
        action="/admin/products"
        method="get"
        className="mt-6 grid gap-3 sm:grid-cols-[minmax(0,1fr)_190px_auto]"
      >
        <input
          type="search"
          name="q"
          defaultValue={search}
          placeholder="Product title or brand"
          aria-label="Search products"
          className={fieldClass}
        />
        <select
          name="status"
          defaultValue={status ?? ""}
          aria-label="Filter by product status"
          className={fieldClass}
        >
          <option value="">All statuses</option>
          {PRODUCT_STATUSES.map((option) => (
            <option key={option} value={option}>
              {STATUS_LABELS[option]}
            </option>
          ))}
        </select>
        <button type="submit" className={primaryButtonClass}>
          Filter
        </button>
      </form>

      <div className="mt-5 flex flex-wrap items-center justify-between gap-3">
        <p className="text-[13px] leading-5 text-ink/45">
          {products.length}{" "}
          {products.length === 1 ? "product" : "products"}
        </p>
        {hasFilters ? (
          <Link
            href="/admin/products"
            className={cn("text-[13px] text-ink/55", textLinkClass)}
          >
            Clear filters
          </Link>
        ) : null}
      </div>

      {products.length === 0 ? (
        <p className="mt-5 border-t border-rule pt-5 text-[13px] leading-5 text-ink/55">
          No products match these filters.
        </p>
      ) : (
        <div className="mt-5 overflow-x-auto">
          <table className="w-full min-w-[820px] border-collapse text-left">
            <caption className="sr-only">Products</caption>
            <thead>
              <tr className="border-b border-rule text-[11px] uppercase leading-4 tracking-[0.12em] text-ink/50">
                <th scope="col" className="py-3 pr-4 font-medium">
                  Product
                </th>
                <th scope="col" className="py-3 pr-4 text-right font-medium">
                  Variants
                </th>
                <th scope="col" className="py-3 pr-4 text-right font-medium">
                  Stock
                </th>
                <th scope="col" className="py-3 pr-4 font-medium">
                  Price range
                </th>
                <th scope="col" className="py-3 pr-4 font-medium">
                  Status
                </th>
                <th scope="col" className="py-3 text-right font-medium">
                  Action
                </th>
              </tr>
            </thead>
            <tbody>
              {products.map((product) => {
                const totalStock = product.variants.reduce(
                  (sum, variant) => sum + variant.stock,
                  0,
                );
                const archived = product.status === "ARCHIVED";

                return (
                  <tr key={product.id} className="border-b border-rule">
                    <td className="py-4 pr-4">
                      <Link
                        href={`/admin/products/${product.id}`}
                        className={cn("text-[14px] text-ink", textLinkClass)}
                      >
                        {product.title}
                      </Link>
                      <p className="mt-1 text-[12px] leading-4 text-ink/45">
                        {product.brand.name}
                      </p>
                    </td>
                    <td className="py-4 pr-4 text-right text-[13px] tabular-nums text-ink/65">
                      {product.variants.length}
                    </td>
                    <td className="py-4 pr-4 text-right text-[13px] tabular-nums text-ink/65">
                      {totalStock}
                    </td>
                    <td className="py-4 pr-4 text-[13px] tabular-nums text-ink/65">
                      {priceRange(product.variants)}
                    </td>
                    <td className="py-4 pr-4 text-[12px] uppercase tracking-[0.1em] text-ink/55">
                      {STATUS_LABELS[product.status]}
                    </td>
                    <td className="py-4 text-right">
                      <form action={setProductArchivedAction}>
                        <input
                          type="hidden"
                          name="productId"
                          value={product.id}
                        />
                        <input
                          type="hidden"
                          name="archived"
                          value={archived ? "false" : "true"}
                        />
                        <button
                          type="submit"
                          className="text-[13px] text-ink/55 underline decoration-rule underline-offset-4 transition-colors hover:text-ink hover:decoration-ink"
                        >
                          {archived ? "Restore" : "Archive"}
                        </button>
                      </form>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
