import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";

import { db } from "@/lib/db";
import { formatOrderDate, firstName, orderStatusLabel } from "@/lib/account";
import { formatPrice } from "@/lib/money";
import { requireUserId } from "@/lib/session";
import {
  pageTitleClass,
  primaryButtonClass,
  sectionTitleClass,
  textLinkClass,
} from "@/lib/styles";
import { cn } from "@/lib/utils";

export const metadata: Metadata = {
  title: "Account",
};

export default async function AccountPage() {
  const userId = await requireUserId("/account");

  const [user, orders, defaultAddress] = await Promise.all([
    db.user.findUnique({
      where: { id: userId },
      select: { name: true, email: true },
    }),
    db.order.findMany({
      where: { userId },
      orderBy: { createdAt: "desc" },
      take: 5,
      select: {
        number: true,
        status: true,
        totalCents: true,
        createdAt: true,
      },
    }),
    db.address.findFirst({
      where: { userId, isDefault: true },
      select: {
        label: true,
        line1: true,
        line2: true,
        city: true,
        postalCode: true,
        country: true,
      },
    }),
  ]);

  if (user === null) {
    redirect("/signin");
  }

  return (
    <div>
      <h1 className={pageTitleClass}>Welcome back, {firstName(user.name)}</h1>
      <p className="mt-3 text-[13px] leading-5 text-ink/55">{user.email}</p>

      <div className="mt-10 grid gap-10 lg:grid-cols-12 lg:gap-16">
        <section className="lg:col-span-7">
          <div className="flex flex-wrap items-baseline justify-between gap-3">
            <h2 className={sectionTitleClass}>Recent orders</h2>
            <Link
              href="/account/orders"
              className={cn("text-[13px] text-ink/60", textLinkClass)}
            >
              View all orders
            </Link>
          </div>

          {orders.length === 0 ? (
            <div className="mt-5 border-t border-rule py-10">
              <p className="text-[14px] leading-5 text-ink">
                You have not placed an order yet.
              </p>
              <Link href="/" className={`${primaryButtonClass} mt-5`}>
                Browse the catalogue
              </Link>
            </div>
          ) : (
            <ul className="mt-5 border-t border-rule">
              {orders.map((order) => (
                <li key={order.number} className="border-b border-rule">
                  <Link
                    href={`/account/orders/${order.number}`}
                    className="grid gap-2 py-4 transition-colors hover:bg-ink/[0.02] sm:grid-cols-[1fr_auto] sm:items-baseline sm:gap-4 sm:px-2"
                  >
                    <span className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
                      <span className="text-[14px] leading-5 text-ink">
                        {order.number}
                      </span>
                      <span className="text-[12px] leading-5 text-ink/45">
                        {formatOrderDate(order.createdAt)}
                      </span>
                    </span>
                    <span className="flex items-baseline justify-between gap-4 sm:justify-end">
                      <span className="text-[11px] uppercase leading-4 tracking-[0.12em] text-ink/50">
                        {orderStatusLabel(order.status)}
                      </span>
                      <span className="w-24 text-right text-[14px] leading-5 tabular-nums text-ink">
                        {formatPrice(order.totalCents)}
                      </span>
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className="lg:col-span-5">
          <div className="flex flex-wrap items-baseline justify-between gap-3">
            <h2 className={sectionTitleClass}>Default address</h2>
            <Link
              href="/account/addresses"
              className={cn("text-[13px] text-ink/60", textLinkClass)}
            >
              Manage addresses
            </Link>
          </div>

          <div className="mt-5 border-t border-rule pt-5">
            {defaultAddress === null ? (
              <>
                <p className="text-[14px] leading-5 text-ink/70">
                  No default address yet. Add one so checkout has somewhere to
                  ship your order.
                </p>
                <Link href="/account/addresses" className={`${primaryButtonClass} mt-5`}>
                  Add an address
                </Link>
              </>
            ) : (
              <address className="not-italic text-[14px] leading-6 text-ink/70">
                <p className="text-[11px] uppercase leading-4 tracking-[0.14em] text-ink/45">
                  {defaultAddress.label}
                </p>
                <p className="mt-2">{defaultAddress.line1}</p>
                {defaultAddress.line2 !== null ? (
                  <p>{defaultAddress.line2}</p>
                ) : null}
                <p>
                  {defaultAddress.city}, {defaultAddress.postalCode}
                </p>
                <p>{defaultAddress.country}</p>
              </address>
            )}
          </div>

          <nav aria-label="Account links" className="mt-10 flex flex-col gap-3 border-t border-rule pt-5">
            <Link
              href="/account/orders"
              className={cn("text-[13px] text-ink/70", textLinkClass)}
            >
              Order history
            </Link>
            <Link
              href="/account/addresses"
              className={cn("text-[13px] text-ink/70", textLinkClass)}
            >
              Delivery addresses
            </Link>
          </nav>
        </section>
      </div>
    </div>
  );
}
