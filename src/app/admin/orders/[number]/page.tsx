import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import type { OrderStatus } from "@prisma/client";

import {
  formatOrderDate,
  orderStatusLabel,
  parseOrderAddress,
} from "@/lib/account";
import { firstParam, requireAdmin } from "@/lib/admin";
import { adminTargetsFor, isOrderStatus } from "@/lib/admin-orders";
import { db } from "@/lib/db";
import { formatPrice } from "@/lib/money";
import {
  eyebrowClass,
  labelClass,
  pageTitleClass,
  primaryButtonClass,
  secondaryButtonClass,
  sectionTitleClass,
  textLinkClass,
} from "@/lib/styles";
import { cn } from "@/lib/utils";

import { transitionOrderAction } from "../actions";

export const metadata: Metadata = {
  title: "Order",
};

interface AdminOrderPageProps {
  params: Promise<{ number: string }>;
  searchParams: Promise<{
    error?: string | string[];
    updated?: string | string[];
  }>;
}

interface HistoryEntry {
  key: string;
  label: string;
  detail: string;
  at: Date | null;
  actor: string | null;
}

const TARGET_LABELS: Partial<Record<OrderStatus, string>> = {
  CANCELLED: "Cancel order",
  FULFILLED: "Mark fulfilled",
  REFUNDED: "Mark refunded",
};

function transitionDetail(detail: unknown): {
  from: string | null;
  to: string | null;
} {
  if (typeof detail !== "object" || detail === null || Array.isArray(detail)) {
    return { from: null, to: null };
  }

  const record = detail as Record<string, unknown>;
  return {
    from: typeof record.from === "string" ? record.from : null,
    to: typeof record.to === "string" ? record.to : null,
  };
}

function statusLabel(value: string | null): string {
  if (value === null) {
    return "Unknown";
  }
  return isOrderStatus(value) ? orderStatusLabel(value) : value;
}

export default async function AdminOrderPage({
  params,
  searchParams,
}: AdminOrderPageProps) {
  const [{ number }, query] = await Promise.all([params, searchParams]);
  await requireAdmin(`/admin/orders/${number}`);

  const order = await db.order.findUnique({
    where: { number },
    include: {
      items: { orderBy: { sku: "asc" } },
      user: { select: { name: true, email: true } },
    },
  });

  if (order === null) {
    notFound();
  }

  const audits = await db.auditLog.findMany({
    where: {
      entity: "Order",
      entityId: order.id,
      action: "order.status_changed",
    },
    orderBy: { createdAt: "asc" },
    select: {
      id: true,
      createdAt: true,
      detail: true,
      actor: { select: { name: true, email: true } },
    },
  });

  const address = parseOrderAddress(order.address);
  const targets = adminTargetsFor(order.status);
  const updatedParam = firstParam(query.updated);
  const updated =
    updatedParam !== undefined && isOrderStatus(updatedParam)
      ? updatedParam
      : null;
  const error = firstParam(query.error) ?? null;

  // An honest history: what the columns record, plus every admin transition
  // from the audit log. Seeded or sweeper-driven terminal states have no audit
  // row, so the current status is shown explicitly instead of invented history.
  const covered = new Set<OrderStatus>(["PENDING"]);
  const history: HistoryEntry[] = [
    {
      key: "placed",
      label: "Order placed",
      detail: statusLabel("PENDING"),
      at: order.createdAt,
      actor: null,
    },
  ];

  if (order.paidAt !== null) {
    history.push({
      key: "paid",
      label: "Payment received",
      detail: statusLabel("PAID"),
      at: order.paidAt,
      actor: null,
    });
    covered.add("PAID");
  }

  for (const audit of audits) {
    const transition = transitionDetail(audit.detail);
    history.push({
      key: audit.id,
      label: "Status changed",
      detail: `${statusLabel(transition.from)} → ${statusLabel(transition.to)}`,
      at: audit.createdAt,
      actor: audit.actor.name,
    });
    if (transition.to !== null && isOrderStatus(transition.to)) {
      covered.add(transition.to);
    }
  }

  if (!covered.has(order.status)) {
    history.push({
      key: "current",
      label: "Current status",
      detail: orderStatusLabel(order.status),
      at: null,
      actor: null,
    });
  }

  return (
    <div>
      <Link
        href="/admin/orders"
        className={cn("text-[13px] text-muted", textLinkClass)}
      >
        Back to orders
      </Link>

      <div className="mt-6 flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className={eyebrowClass}>Order</p>
          <h1 className={cn(pageTitleClass, "mt-2")}>{order.number}</h1>
          <p className="mt-3 text-[13px] leading-5 text-muted">
            {order.user.email} · placed {formatOrderDate(order.createdAt)}
          </p>
        </div>
        <span className="inline-flex border border-rule px-3 py-1 text-[11px] uppercase leading-4 tracking-[0.14em] text-muted">
          {orderStatusLabel(order.status)}
        </span>
      </div>

      {error !== null ? (
        <p
          role="alert"
          className="mt-6 border-l-2 border-sale pl-3 text-[13px] leading-5 text-sale"
        >
          {error}
        </p>
      ) : null}
      {updated !== null ? (
        <p className="mt-6 border-l-2 border-rule pl-3 text-[13px] leading-5 text-muted">
          Status updated to {orderStatusLabel(updated)}.
        </p>
      ) : null}

      <section className="mt-8 border-t border-rule pt-6">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <p className={labelClass}>Actions</p>
          {targets.length === 0 ? (
            <p className="text-[13px] leading-5 text-muted">
              No admin actions for this status.
            </p>
          ) : (
            <div className="flex flex-wrap gap-2">
              {targets.map((target) => (
                <form key={target} action={transitionOrderAction}>
                  <input type="hidden" name="orderId" value={order.id} />
                  <input type="hidden" name="target" value={target} />
                  <button
                    type="submit"
                    className={
                      target === "CANCELLED"
                        ? secondaryButtonClass
                        : primaryButtonClass
                    }
                  >
                    {TARGET_LABELS[target] ?? target}
                  </button>
                </form>
              ))}
            </div>
          )}
        </div>
        <p className="mt-3 text-[13px] leading-4 text-muted">
          Only transitions from the order state machine are accepted. Cancelling
          a pending order restores its reserved stock. Every change writes an
          audit row.
        </p>
      </section>

      <div className="mt-10 grid gap-10 lg:grid-cols-12 lg:gap-16">
        <section className="lg:col-span-8">
          <h2 className={sectionTitleClass}>Items</h2>

          <div className="mt-5 overflow-x-auto">
            <table className="w-full min-w-[560px] border-collapse text-left">
              <caption className="sr-only">Items in this order</caption>
              <thead>
                <tr className="border-b border-rule text-[11px] uppercase leading-4 tracking-[0.14em] text-muted">
                  <th scope="col" className="py-2 pr-4 font-medium">
                    Item
                  </th>
                  <th scope="col" className="py-2 pr-4 text-right font-medium">
                    Qty
                  </th>
                  <th scope="col" className="py-2 pr-4 text-right font-medium">
                    Unit
                  </th>
                  <th scope="col" className="py-2 text-right font-medium">
                    Total
                  </th>
                </tr>
              </thead>
              <tbody>
                {order.items.map((item) => (
                  <tr key={item.id} className="border-b border-rule">
                    <td className="py-2.5 pr-4">
                      <p className="text-[15px] leading-5 text-ink">
                        {item.nameSnapshot}
                      </p>
                      <p className="mt-1 text-[13px] leading-4 text-muted">
                        {item.sku}
                      </p>
                    </td>
                    <td className="py-2.5 pr-4 text-right text-[13px] tabular-nums text-muted">
                      {item.quantity}
                    </td>
                    <td className="py-2.5 pr-4 text-right text-[13px] tabular-nums text-muted">
                      {formatPrice(item.unitPriceCents)}
                    </td>
                    <td className="py-2.5 text-right text-[13px] tabular-nums text-ink">
                      {formatPrice(item.unitPriceCents * item.quantity)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <dl className="mt-6 ml-auto flex max-w-[320px] flex-col gap-3 text-[15px] leading-5">
            <div className="flex items-baseline justify-between gap-4">
              <dt className="text-muted">Subtotal</dt>
              <dd className="tabular-nums text-ink">
                {formatPrice(order.subtotalCents)}
              </dd>
            </div>
            <div className="flex items-baseline justify-between gap-4">
              <dt className="text-muted">Shipping</dt>
              <dd className="tabular-nums text-ink">
                {order.shippingCents === 0
                  ? "Free"
                  : formatPrice(order.shippingCents)}
              </dd>
            </div>
            <div className="flex items-baseline justify-between gap-4 border-t border-rule pt-3">
              <dt className="text-ink">Total</dt>
              <dd className="text-[17px] tabular-nums text-ink">
                {formatPrice(order.totalCents)}
              </dd>
            </div>
          </dl>
        </section>

        <aside className="lg:col-span-4">
          <h2 className={sectionTitleClass}>Delivery address</h2>
          <div className="mt-5 border-t border-rule pt-5">
            {address === null ? (
              <p className="text-[13px] leading-5 text-muted">
                The address for this order is not available.
              </p>
            ) : (
              <address className="not-italic text-[15px] leading-6 text-muted">
                <p className="text-[11px] uppercase leading-4 tracking-[0.14em] text-muted">
                  {address.label}
                </p>
                <p className="mt-2">{address.line1}</p>
                {address.line2 !== null ? <p>{address.line2}</p> : null}
                <p>
                  {address.city}, {address.postalCode}
                </p>
                <p>{address.country}</p>
              </address>
            )}
          </div>

          <h2 className={cn(sectionTitleClass, "mt-10")}>Status history</h2>
          <ol className="mt-5 border-t border-rule">
            {history.map((entry) => (
              <li
                key={entry.key}
                className="border-b border-rule py-2 text-[13px] leading-5"
              >
                <div className="flex items-baseline justify-between gap-4">
                  <span className="text-muted">{entry.label}</span>
                  <span className="shrink-0 text-[13px] leading-4 text-muted">
                    {entry.at === null ? "Recorded" : formatOrderDate(entry.at)}
                  </span>
                </div>
                <p className="mt-1 text-[13px] leading-4 text-muted">
                  {entry.detail}
                  {entry.actor !== null ? ` · ${entry.actor}` : ""}
                </p>
              </li>
            ))}
          </ol>
        </aside>
      </div>
    </div>
  );
}
