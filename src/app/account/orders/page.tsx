import type { Metadata } from "next";
import Link from "next/link";

import { db } from "@/lib/db";
import { formatOrderDate, orderStatusLabel } from "@/lib/account";
import { formatPrice } from "@/lib/money";
import { requireUserId } from "@/lib/session";
import {
  pageTitleClass,
  primaryButtonClass,
  textLinkClass,
} from "@/lib/styles";
import { cn } from "@/lib/utils";

export const metadata: Metadata = {
  title: "Orders",
};

export default async function OrdersPage() {
  const userId = await requireUserId("/account/orders");

  const orders = await db.order.findMany({
    where: { userId },
    orderBy: { createdAt: "desc" },
    select: {
      number: true,
      status: true,
      totalCents: true,
      createdAt: true,
    },
  });

  return (
    <div>
      <h1 className={pageTitleClass}>Orders</h1>
      <p className="mt-3 text-[13px] leading-5 text-ink/55">
        Every order on this account, newest first.
      </p>

      {orders.length === 0 ? (
        <div className="mt-8 border-t border-rule py-12">
          <p className="text-[14px] leading-5 text-ink">
            You have not placed an order yet.
          </p>
          <Link href="/" className={`${primaryButtonClass} mt-5`}>
            Browse the catalogue
          </Link>
        </div>
      ) : (
        <div className="mt-8 overflow-x-auto">
          <table className="w-full min-w-[560px] border-collapse text-left">
            <caption className="sr-only">Your orders</caption>
            <thead>
              <tr className="border-b border-rule text-[11px] uppercase leading-4 tracking-[0.12em] text-ink/50">
                <th scope="col" className="py-3 pr-4 font-medium">
                  Order
                </th>
                <th scope="col" className="py-3 pr-4 font-medium">
                  Date
                </th>
                <th scope="col" className="py-3 pr-4 font-medium">
                  Status
                </th>
                <th scope="col" className="py-3 text-right font-medium">
                  Total
                </th>
              </tr>
            </thead>
            <tbody>
              {orders.map((order) => (
                <tr key={order.number} className="border-b border-rule">
                  <td className="py-4 pr-4">
                    <Link
                      href={`/account/orders/${order.number}`}
                      className={cn("text-[14px] text-ink", textLinkClass)}
                    >
                      {order.number}
                    </Link>
                  </td>
                  <td className="py-4 pr-4 text-[13px] text-ink/60">
                    {formatOrderDate(order.createdAt)}
                  </td>
                  <td className="py-4 pr-4 text-[12px] uppercase tracking-[0.1em] text-ink/55">
                    {orderStatusLabel(order.status)}
                  </td>
                  <td className="py-4 text-right text-[14px] tabular-nums text-accent">
                    {formatPrice(order.totalCents)}
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
