import type { Metadata } from "next";
import Link from "next/link";

import type { Prisma } from "@prisma/client";

import { orderStatusLabel } from "@/lib/account";
import { firstParam, formatOrderAge, requireAdmin } from "@/lib/admin";
import { ORDER_STATUSES, isOrderStatus } from "@/lib/admin-orders";
import { db } from "@/lib/db";
import {
  fieldClass,
  pageTitleClass,
  primaryButtonClass,
  textLinkClass,
} from "@/lib/styles";
import { formatPrice } from "@/lib/money";
import { cn } from "@/lib/utils";

export const metadata: Metadata = {
  title: "Orders",
};

interface AdminOrdersPageProps {
  searchParams: Promise<{
    status?: string | string[];
    q?: string | string[];
    error?: string | string[];
  }>;
}

export default async function AdminOrdersPage({
  searchParams,
}: AdminOrdersPageProps) {
  await requireAdmin("/admin/orders");

  const query = await searchParams;
  const statusParam = firstParam(query.status) ?? "";
  const status = isOrderStatus(statusParam) ? statusParam : null;
  const search = (firstParam(query.q) ?? "").trim().slice(0, 120);
  const error = firstParam(query.error) ?? null;

  const where: Prisma.OrderWhereInput = {};
  if (status !== null) {
    where.status = status;
  }
  if (search.length > 0) {
    where.OR = [
      { number: { contains: search, mode: "insensitive" } },
      { user: { email: { contains: search, mode: "insensitive" } } },
    ];
  }

  const orders = await db.order.findMany({
    where,
    orderBy: { createdAt: "desc" },
    take: 200,
    select: {
      number: true,
      status: true,
      totalCents: true,
      createdAt: true,
      user: { select: { email: true } },
    },
  });

  const now = new Date();
  const hasFilters = status !== null || search.length > 0;

  return (
    <div>
      <h1 className={pageTitleClass}>Orders</h1>
      <p className="mt-3 text-[13px] leading-5 text-ink/55">
        Filter by status or find an order by number or customer email.
      </p>

      {error !== null ? (
        <p
          role="alert"
          className="mt-5 border-l-2 border-accent pl-3 text-[13px] leading-5 text-accent"
        >
          {error}
        </p>
      ) : null}

      <form
        action="/admin/orders"
        method="get"
        className="mt-6 grid gap-3 sm:grid-cols-[minmax(0,1fr)_190px_auto]"
      >
        <input
          type="search"
          name="q"
          defaultValue={search}
          placeholder="Order number or customer email"
          aria-label="Search orders"
          className={fieldClass}
        />
        <select
          name="status"
          defaultValue={status ?? ""}
          aria-label="Filter by status"
          className={fieldClass}
        >
          <option value="">All statuses</option>
          {ORDER_STATUSES.map((option) => (
            <option key={option} value={option}>
              {orderStatusLabel(option)}
            </option>
          ))}
        </select>
        <button type="submit" className={primaryButtonClass}>
          Filter
        </button>
      </form>

      <div className="mt-5 flex flex-wrap items-center justify-between gap-3">
        <p className="text-[13px] leading-5 text-ink/45">
          {orders.length} {orders.length === 1 ? "order" : "orders"}
        </p>
        {hasFilters ? (
          <Link
            href="/admin/orders"
            className={cn("text-[13px] text-ink/55", textLinkClass)}
          >
            Clear filters
          </Link>
        ) : null}
      </div>

      {orders.length === 0 ? (
        <p className="mt-5 border-t border-rule pt-5 text-[13px] leading-5 text-ink/55">
          No orders match these filters.
        </p>
      ) : (
        <div className="mt-5 overflow-x-auto">
          <table className="w-full min-w-[720px] border-collapse text-left">
            <caption className="sr-only">Orders</caption>
            <thead>
              <tr className="border-b border-rule text-[11px] uppercase leading-4 tracking-[0.12em] text-ink/50">
                <th scope="col" className="py-3 pr-4 font-medium">
                  Order
                </th>
                <th scope="col" className="py-3 pr-4 font-medium">
                  Customer
                </th>
                <th scope="col" className="py-3 pr-4 text-right font-medium">
                  Total
                </th>
                <th scope="col" className="py-3 pr-4 font-medium">
                  Status
                </th>
                <th scope="col" className="py-3 text-right font-medium">
                  Age
                </th>
              </tr>
            </thead>
            <tbody>
              {orders.map((order) => (
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
                  <td className="py-4 pr-4 text-right text-[13px] tabular-nums text-ink">
                    {formatPrice(order.totalCents)}
                  </td>
                  <td className="py-4 pr-4 text-[12px] uppercase tracking-[0.1em] text-ink/55">
                    {orderStatusLabel(order.status)}
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

      <p className="mt-4 text-[12px] leading-4 text-ink/40">
        Showing at most 200 orders, newest first.
      </p>
    </div>
  );
}
