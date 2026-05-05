import type { Metadata } from "next";
import Link from "next/link";

import type { OrderStatus } from "@prisma/client";

import { orderStatusLabel } from "@/lib/account";
import {
  LOW_STOCK_THRESHOLD,
  formatOrderAge,
  requireAdmin,
} from "@/lib/admin";
import { db } from "@/lib/db";
import { formatPrice } from "@/lib/money";
import {
  eyebrowClass,
  pageTitleClass,
  sectionTitleClass,
  textLinkClass,
} from "@/lib/styles";
import { cn } from "@/lib/utils";

export const metadata: Metadata = {
  title: "Dashboard",
};

function Counter({
  label,
  value,
  note,
}: {
  label: string;
  value: string;
  note?: string;
}) {
  return (
    <div className="border-t border-rule pt-4">
      <p className={eyebrowClass}>{label}</p>
      <p className="mt-2 text-[28px] font-medium leading-9 tabular-nums text-ink">
        {value}
      </p>
      {note !== undefined ? (
        <p className="mt-1 text-[12px] leading-4 text-ink/45">{note}</p>
      ) : null}
    </div>
  );
}

export default async function AdminDashboardPage() {
  await requireAdmin("/admin");

  const now = new Date();
  const monthStart = new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1),
  );
  const nextMonthStart = new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1),
  );

  const openStatuses: OrderStatus[] = ["PENDING", "PAID", "REFUND_REQUIRED"];
  const revenueStatuses: OrderStatus[] = ["PAID", "FULFILLED"];

  const [openOrders, revenue, lowStock, archived, latestOrders, lowestStock] =
    await Promise.all([
      db.order.count({ where: { status: { in: openStatuses } } }),
      db.order.aggregate({
        _sum: { totalCents: true },
        where: {
          status: { in: revenueStatuses },
          paidAt: { gte: monthStart, lt: nextMonthStart },
        },
      }),
      db.variant.count({ where: { stock: { lt: LOW_STOCK_THRESHOLD } } }),
      db.product.count({ where: { status: "ARCHIVED" } }),
      db.order.findMany({
        orderBy: { createdAt: "desc" },
        take: 10,
        select: {
          number: true,
          status: true,
          totalCents: true,
          createdAt: true,
          user: { select: { email: true, name: true } },
        },
      }),
      db.variant.findMany({
        orderBy: [{ stock: "asc" }, { sku: "asc" }],
        take: 5,
        select: {
          id: true,
          sku: true,
          title: true,
          stock: true,
          product: { select: { id: true, title: true, status: true } },
        },
      }),
    ]);

  const revenueCents = revenue._sum.totalCents ?? 0;

  return (
    <div>
      <h1 className={pageTitleClass}>Dashboard</h1>
      <p className="mt-3 text-[13px] leading-5 text-ink/55">
        Open orders are pending, paid or refund required. Revenue is paid and
        fulfilled orders by payment date, UTC.
      </p>

      <section className="mt-8 grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
        <Counter label="Open orders" value={String(openOrders)} />
        <Counter
          label="Revenue this month"
          value={formatPrice(revenueCents)}
          note="Paid and fulfilled, UTC month"
        />
        <Counter
          label="Low stock variants"
          value={String(lowStock)}
          note={`Stock below ${LOW_STOCK_THRESHOLD}`}
        />
        <Counter label="Archived products" value={String(archived)} />
      </section>

      <section className="mt-12">
        <div className="flex flex-wrap items-baseline justify-between gap-4">
          <h2 className={sectionTitleClass}>Latest orders</h2>
          <Link
            href="/admin/orders"
            className={cn("text-[13px] text-ink/55", textLinkClass)}
          >
            All orders
          </Link>
        </div>

        {latestOrders.length === 0 ? (
          <p className="mt-5 border-t border-rule pt-5 text-[13px] leading-5 text-ink/55">
            No orders yet.
          </p>
        ) : (
          <div className="mt-5 overflow-x-auto">
            <table className="w-full min-w-[640px] border-collapse text-left">
              <caption className="sr-only">Ten latest orders</caption>
              <thead>
                <tr className="border-b border-rule text-[11px] uppercase leading-4 tracking-[0.12em] text-ink/50">
                  <th scope="col" className="py-3 pr-4 font-medium">
                    Order
                  </th>
                  <th scope="col" className="py-3 pr-4 font-medium">
                    Customer
                  </th>
                  <th scope="col" className="py-3 pr-4 font-medium">
                    Status
                  </th>
                  <th scope="col" className="py-3 pr-4 text-right font-medium">
                    Total
                  </th>
                  <th scope="col" className="py-3 text-right font-medium">
                    Age
                  </th>
                </tr>
              </thead>
              <tbody>
                {latestOrders.map((order) => (
                  <tr key={order.number} className="border-b border-rule">
                    <td className="py-4 pr-4">
                      <Link
                        href={`/admin/orders/${order.number}`}
                        className={cn("text-[14px] text-ink", textLinkClass)}
                      >
                        {order.number}
                      </Link>
                    </td>
                    <td className="py-4 pr-4 text-[13px] text-ink/65">
                      {order.user.email}
                    </td>
                    <td className="py-4 pr-4 text-[12px] uppercase tracking-[0.1em] text-ink/55">
                      {orderStatusLabel(order.status)}
                    </td>
                    <td className="py-4 pr-4 text-right text-[13px] tabular-nums text-ink">
                      {formatPrice(order.totalCents)}
                    </td>
                    <td className="py-4 text-right text-[13px] tabular-nums text-ink/55">
                      <time dateTime={order.createdAt.toISOString()}>
                        {formatOrderAge(order.createdAt, now)}
                      </time>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section className="mt-12">
        <div className="flex flex-wrap items-baseline justify-between gap-4">
          <h2 className={sectionTitleClass}>Lowest stock</h2>
          <Link
            href="/admin/inventory"
            className={cn("text-[13px] text-ink/55", textLinkClass)}
          >
            Inventory
          </Link>
        </div>

        {lowestStock.length === 0 ? (
          <p className="mt-5 border-t border-rule pt-5 text-[13px] leading-5 text-ink/55">
            No variants.
          </p>
        ) : (
          <div className="mt-5 overflow-x-auto">
            <table className="w-full min-w-[600px] border-collapse text-left">
              <caption className="sr-only">Five lowest-stock variants</caption>
              <thead>
                <tr className="border-b border-rule text-[11px] uppercase leading-4 tracking-[0.12em] text-ink/50">
                  <th scope="col" className="py-3 pr-4 font-medium">
                    SKU
                  </th>
                  <th scope="col" className="py-3 pr-4 font-medium">
                    Product
                  </th>
                  <th scope="col" className="py-3 pr-4 font-medium">
                    Variant
                  </th>
                  <th scope="col" className="py-3 text-right font-medium">
                    Stock
                  </th>
                </tr>
              </thead>
              <tbody>
                {lowestStock.map((variant) => (
                  <tr key={variant.id} className="border-b border-rule">
                    <td className="py-4 pr-4 text-[12px] tabular-nums text-ink/55">
                      {variant.sku}
                    </td>
                    <td className="py-4 pr-4">
                      <Link
                        href={`/admin/products/${variant.product.id}`}
                        className={cn("text-[13px] text-ink", textLinkClass)}
                      >
                        {variant.product.title}
                      </Link>
                      {variant.product.status === "ARCHIVED" ? (
                        <span className="ml-2 text-[11px] uppercase tracking-[0.1em] text-ink/40">
                          Archived
                        </span>
                      ) : null}
                    </td>
                    <td className="py-4 pr-4 text-[13px] text-ink/65">
                      {variant.title}
                    </td>
                    <td className="py-4 text-right text-[13px] tabular-nums text-ink">
                      {variant.stock}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
