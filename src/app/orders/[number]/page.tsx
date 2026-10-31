import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import {
  formatOrderDate,
  orderStatusLabel,
  parseOrderAddress,
} from "@/lib/account";
import { formatPrice } from "@/lib/money";
import { findOrderForCustomer } from "@/lib/orders";
import { orderDescription } from "@/lib/seo";
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
  return {
    title: `Order ${number}`,
    description: orderDescription(number),
  };
}

// Calendar-day estimate after the order is placed, in UTC like every other
// date shown in the storefront. Standard: 3–5 days; express: 1–2 days.
function deliveryWindow(
  placedAt: Date,
  deliveryMethod: "STANDARD" | "EXPRESS",
): string {
  const [minDays, maxDays] =
    deliveryMethod === "EXPRESS" ? [1, 2] : [3, 5];
  const day = 24 * 60 * 60 * 1_000;
  const start = new Date(placedAt.getTime() + minDays * day);
  const end = new Date(placedAt.getTime() + maxDays * day);
  return `${formatOrderDate(start)} – ${formatOrderDate(end)}`;
}

export default async function OrderConfirmationPage({
  params,
}: OrderPageProps) {
  const { number } = await params;
  const userId = await requireUserId(`/orders/${number}`);

  const order = await findOrderForCustomer(number, userId);

  if (order === null) {
    notFound();
  }

  const address = parseOrderAddress(order.address);
  const pending = order.status === "PENDING";

  return (
    <div className="mx-auto w-full max-w-[880px] px-6 py-10 lg:px-10 lg:py-16">
      <Link
        href="/account/orders"
        className={cn("text-[13px] text-muted", textLinkClass)}
      >
        Back to orders
      </Link>

      <div className="mt-6 flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className={eyebrowClass}>Order confirmation</p>
          <h1 className={cn(pageTitleClass, "mt-2")}>{order.number}</h1>
          <p className="mt-3 text-[13px] leading-5 text-muted">
            Placed {formatOrderDate(order.createdAt)}
          </p>
        </div>
        <span className="inline-flex border border-rule px-3 py-1 text-[11px] uppercase leading-4 tracking-[0.14em] text-muted">
          {orderStatusLabel(order.status)}
        </span>
      </div>

      <div className="mt-6 border border-rule bg-surface p-4">
        <p className="text-[11px] uppercase leading-4 tracking-[0.14em] text-muted">
          Payment
        </p>
        <p className="mt-2 text-[15px] leading-5 text-ink">
          Stripe sandbox payment
        </p>
        <p className="mt-1 text-[13px] leading-5 text-muted">
          {pending
            ? "The card is collected by Stripe in test mode. This order stays pending until the signed Stripe webhook confirms the amount."
            : order.status === "PAID" || order.status === "FULFILLED"
              ? "Stripe confirmed the payment in test mode. No real money moved."
              : "This order is not paid. Stripe did not confirm a matching amount."}
        </p>
      </div>

      <div className="mt-10 grid gap-10 lg:grid-cols-12 lg:gap-12">
        <section className="lg:col-span-8">
          <h2 className={sectionTitleClass}>Items</h2>

          <div className="mt-5 overflow-x-auto">
            <table className="w-full min-w-[480px] border-collapse text-left">
              <caption className="sr-only">Items in this order</caption>
              <thead>
                <tr className="border-b border-rule text-[11px] uppercase leading-4 tracking-[0.14em] text-muted">
                  <th scope="col" className="py-3 pr-4 font-medium">
                    Item
                  </th>
                  <th scope="col" className="py-3 pr-4 text-right font-medium">
                    Qty
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
                      <p className="text-[15px] leading-5 text-ink">
                        {item.nameSnapshot}
                      </p>
                      <p className="mt-1 text-[13px] leading-4 text-muted">
                        {item.sku} · {formatPrice(item.unitPriceCents)} each
                      </p>
                    </td>
                    <td className="py-4 pr-4 text-right text-[13px] tabular-nums text-muted">
                      {item.quantity}
                    </td>
                    <td className="py-4 text-right text-[13px] tabular-nums text-ink">
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
              <dt className="text-muted">
                Shipping ({order.deliveryMethod === "EXPRESS" ? "Express" : "Standard"})
              </dt>
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
          <h2 className={sectionTitleClass}>Delivery</h2>
          <div className="mt-5 border-t border-rule pt-5">
            <p className="text-[13px] leading-5 text-muted">
              Estimated{" "}
              <span className="text-ink">
                {deliveryWindow(order.createdAt, order.deliveryMethod)}
              </span>
            </p>

            {address === null ? (
              <p className="mt-4 text-[13px] leading-5 text-muted">
                The address for this order is not available.
              </p>
            ) : (
              <address className="mt-4 not-italic text-[15px] leading-6 text-muted">
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

          <Link
            href={`/account/orders/${order.number}`}
            className={cn("mt-8 inline-block text-[13px] text-muted", textLinkClass)}
          >
            View this order in your account
          </Link>
        </aside>
      </div>
    </div>
  );
}
