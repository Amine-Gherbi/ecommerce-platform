import type { Metadata } from "next";
import Link from "next/link";

import { LOW_STOCK_THRESHOLD, firstParam, requireAdmin } from "@/lib/admin";
import { db } from "@/lib/db";
import {
  fieldClass,
  pageTitleClass,
  secondaryButtonClass,
  textLinkClass,
} from "@/lib/styles";
import { cn } from "@/lib/utils";

import { updateStockAction } from "./actions";

export const metadata: Metadata = {
  title: "Inventory",
};

interface AdminInventoryPageProps {
  searchParams: Promise<{
    saved?: string | string[];
    error?: string | string[];
  }>;
}

export default async function AdminInventoryPage({
  searchParams,
}: AdminInventoryPageProps) {
  await requireAdmin("/admin/inventory");

  const query = await searchParams;
  const saved = firstParam(query.saved) ?? null;
  const error = firstParam(query.error) ?? null;

  const variants = await db.variant.findMany({
    where: { stock: { lt: LOW_STOCK_THRESHOLD } },
    orderBy: [{ stock: "asc" }, { sku: "asc" }],
    select: {
      id: true,
      sku: true,
      title: true,
      stock: true,
      product: { select: { id: true, title: true, status: true } },
    },
  });

  return (
    <div>
      <h1 className={pageTitleClass}>Inventory</h1>
      <p className="mt-3 text-[13px] leading-5 text-muted">
        Variants with stock below {LOW_STOCK_THRESHOLD}. Updating stock here
        writes an audit row; it does not change existing orders.
      </p>

      {error !== null ? (
        <p
          role="alert"
          className="mt-5 border-l-2 border-sale pl-3 text-[13px] leading-5 text-sale"
        >
          {error}
        </p>
      ) : null}
      {saved === "stock" ? (
        <p className="mt-5 border-l-2 border-rule pl-3 text-[13px] leading-5 text-muted">
          Stock updated.
        </p>
      ) : null}

      {variants.length === 0 ? (
        <p className="mt-6 border-t border-rule pt-5 text-[13px] leading-5 text-muted">
          No variants below {LOW_STOCK_THRESHOLD} units.
        </p>
      ) : (
        <div className="mt-6 overflow-x-auto">
          <table className="w-full min-w-[720px] border-collapse text-left">
            <caption className="sr-only">Low-stock variants</caption>
            <thead>
              <tr className="border-b border-rule text-[11px] uppercase leading-4 tracking-[0.14em] text-muted">
                <th scope="col" className="py-2 pr-4 font-medium">
                  SKU
                </th>
                <th scope="col" className="py-2 pr-4 font-medium">
                  Product
                </th>
                <th scope="col" className="py-2 pr-4 font-medium">
                  Variant
                </th>
                <th scope="col" className="py-2 pr-4 text-right font-medium">
                  Stock
                </th>
                <th scope="col" className="py-2 text-right font-medium">
                  Update
                </th>
              </tr>
            </thead>
            <tbody>
              {variants.map((variant) => (
                <tr key={variant.id} className="border-b border-rule">
                  <td className="py-2.5 pr-4 text-[13px] tabular-nums text-muted">
                    {variant.sku}
                  </td>
                  <td className="py-2.5 pr-4">
                    <Link
                      href={`/admin/products/${variant.product.id}`}
                      className={cn("text-[13px] text-ink", textLinkClass)}
                    >
                      {variant.product.title}
                    </Link>
                    {variant.product.status === "ARCHIVED" ? (
                      <span className="ml-2 text-[11px] uppercase tracking-[0.14em] text-muted">
                        Archived
                      </span>
                    ) : null}
                  </td>
                  <td className="py-2.5 pr-4 text-[13px] text-muted">
                    {variant.title}
                  </td>
                  <td className="py-2.5 pr-4 text-right text-[13px] tabular-nums text-ink">
                    {variant.stock}
                  </td>
                  <td className="py-2.5">
                    <form
                      action={updateStockAction}
                      className="flex items-center justify-end gap-2"
                    >
                      <input
                        type="hidden"
                        name="variantId"
                        value={variant.id}
                      />
                      <input
                        type="number"
                        name="stock"
                        min={0}
                        step={1}
                        defaultValue={variant.stock}
                        aria-label={`Stock for ${variant.sku}`}
                        className={cn(fieldClass, "h-9 w-24 text-right")}
                      />
                      <button
                        type="submit"
                        className={cn(secondaryButtonClass, "h-9 px-4")}
                      >
                        Update
                      </button>
                    </form>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
