import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import {
  formatOrderDate,
  orderStatusLabel,
  orderTimeline,
  parseOrderAddress,
} from "@/lib/account";
import { formatPrice } from "@/lib/money";
import { findOrderForCustomer } from "@/lib/orders";
import { requireUserId } from "@/lib/session";
import {
  eyebrowClass,
  pageTitleClass,
  sectionTitleClass,
  textLinkClass,
} from "@/lib/styles";
import { cn } from "@/lib/utils";

interface OrderPageProps {
  params: Promise<{ number: string }>;
}

export async function generateMetadata({
  params,
}: OrderPageProps): Promise<Metadata> {
  const { number } = await params;
  return { title: `Order ${number}` };
}

export default async function OrderDetailPage({ params }: OrderPageProps) {
  const { number } = await params;
  const userId = await requireUserId(`/account/orders/${number}`);

  const order = await findOrderForCustomer(number, userId);

  if (order === null) {
    notFound();
  }

  const address = parseOrderAddress(order.address);
  const timeline = orderTimeline(order);

  return (
    <div>
      <Link
        href="/account/orders"
        className={cn("text-[13px] text-ink/55", textLinkClass)}
      >
        Back to orders
      </Link>

      <div className="mt-6 flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className={eyebrowClass}>Order</p>
          <h1 className={cn(pageTitleClass, "mt-2")}>{order.number}</h1>
          <p className="mt-3 text-[13px] leading-5 text-ink/55">
            Placed {formatOrderDate(order.createdAt)}
          </p>
        </div>
        <span className="inline-flex border border-rule px-3 py-1 text-[11px] uppercase leading-4 tracking-[0.14em] text-ink/60">
          {orderStatusLabel(order.status)}
        </span>
      </div>

      <div className="mt-10 grid gap-10 lg:grid-cols-12 lg:gap-16">
        <section className="lg:col-span-8">
          <h2 className={sectionTitleClass}>Items</h2>

          <div className="mt-5 overflow-x-auto">
            <table className="w-full min-w-[520px] border-collapse text-left">
              <caption className="sr-only">Items in this order</caption>
              <thead>
                <tr className="border-b border-rule text-[11px] uppercase leading-4 tracking-[0.12em] text-ink/50">
                  <th scope="col" className="py-3 pr-4 font-medium">
                    Item
                  </th>
                  <th scope="col" className="py-3 pr-4 text-right font-medium">
                    Qty
                  </th>
                  <th scope="col" className="py-3 pr-4 text-right font-medium">
                    Unit
                  </th>
                  <th scope="col" className="py-3 text-right font-medium">
                    Total
                  </th>
                </tr>
              </thead>
              <tbody>
                {order.items.map((item) => (
                  <tr key={item.id} className="border-b border-rule">
                    <td className="py-4 pr-4">
                      <p className="text-[14px] leading-5 text-ink">
                        {item.nameSnapshot}
                      </p>
                      <p className="mt-1 text-[12px] leading-4 text-ink/45">
                        {item.sku}
                      </p>
                    </td>
                    <td className="py-4 pr-4 text-right text-[13px] tabular-nums text-ink/70">
                      {item.quantity}
                    </td>
                    <td className="py-4 pr-4 text-right text-[13px] tabular-nums text-ink/70">
                      {formatPrice(item.unitPriceCents)}
                    </td>
                    <td className="py-4 text-right text-[13px] tabular-nums text-ink">
                      {formatPrice(item.unitPriceCents * item.quantity)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <dl className="mt-6 ml-auto flex max-w-[320px] flex-col gap-3 text-[14px] leading-5">
            <div className="flex items-baseline justify-between gap-4">
              <dt className="text-ink/60">Subtotal</dt>
              <dd className="tabular-nums text-ink">
                {formatPrice(order.subtotalCents)}
              </dd>
            </div>
            <div className="flex items-baseline justify-between gap-4">
              <dt className="text-ink/60">Shipping</dt>
              <dd className="tabular-nums text-ink">
                {order.shippingCents === 0
                  ? "Free"
                  : formatPrice(order.shippingCents)}
              </dd>
            </div>
            <div className="flex items-baseline justify-between gap-4 border-t border-rule pt-3">
              <dt className="text-ink">Total</dt>
              <dd className="text-[18px] tabular-nums text-accent">
                {formatPrice(order.totalCents)}
              </dd>
            </div>
          </dl>
        </section>

        <aside className="lg:col-span-4">
          <h2 className={sectionTitleClass}>Delivery address</h2>
          <div className="mt-5 border-t border-rule pt-5">
            {address === null ? (
              <p className="text-[13px] leading-5 text-ink/55">
                The address for this order is not available.
              </p>
            ) : (
              <address className="not-italic text-[14px] leading-6 text-ink/70">
                <p className="text-[11px] uppercase leading-4 tracking-[0.14em] text-ink/45">
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
            {timeline.map((event, index) => (
              <li
                key={`${event.label}-${index}`}
                className="flex items-baseline justify-between gap-4 border-b border-rule py-3"
              >
                <span className="text-[13px] leading-5 text-ink/70">
                  {event.label}
                </span>
                <span className="shrink-0 text-[12px] leading-4 text-ink/45">
                  {event.at === null ? "Recorded" : formatOrderDate(event.at)}
                </span>
              </li>
            ))}
          </ol>
        </aside>
      </div>
    </div>
  );
}
