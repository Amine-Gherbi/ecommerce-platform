import type { Metadata } from "next";
import Link from "next/link";

import { AddressForm } from "@/app/account/addresses/address-forms";
import { addAddress } from "@/app/account/addresses/actions";
import { Breadcrumbs, Container } from "@/components/store/ui";
import { cartVersion, computeTotals } from "@/lib/checkout";
import { db } from "@/lib/db";
import {
  EXPRESS_SHIPPING_CENTS,
  formatPrice,
  shippingForSubtotal,
  shippingRuleCopy,
} from "@/lib/money";
import { requireUserId } from "@/lib/session";
import {
  eyebrowClass,
  pageTitleClass,
  primaryButtonClass,
  sectionTitleClass,
} from "@/lib/styles";
import { cn } from "@/lib/utils";

import { chooseDeliveryMethod } from "./actions";
import { CheckoutForm, type CheckoutAddress } from "./checkout-form";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Checkout",
};

export default async function CheckoutPage() {
  const userId = await requireUserId("/checkout");

  const [cart, addresses] = await Promise.all([
    db.cart.findUnique({
      where: { userId },
      include: {
        items: {
          orderBy: { variantId: "asc" },
          include: {
            variant: {
              include: {
                product: { include: { brand: { select: { name: true } } } },
              },
            },
          },
        },
      },
    }),
    db.address.findMany({
      where: { userId },
      orderBy: [{ isDefault: "desc" }, { label: "asc" }],
      select: {
        id: true,
        label: true,
        line1: true,
        line2: true,
        city: true,
        postalCode: true,
        country: true,
      },
    }),
  ]);

  const items = cart?.items ?? [];
  const deliveryMethod = cart?.deliveryMethod ?? "STANDARD";
  const totals = computeTotals(
    items.map((item) => ({
      variantId: item.variantId,
      quantity: item.quantity,
      priceCents: item.variant.priceCents,
    })),
    deliveryMethod,
  );
  const version = cartVersion(
    items.map((item) => ({
      variantId: item.variantId,
      quantity: item.quantity,
    })),
  );

  const standardShipping = shippingForSubtotal(totals.subtotalCents, "STANDARD");
  const checkoutAddresses: CheckoutAddress[] = addresses;

  return (
    <div>
      <section className="border-b border-rule">
        <Container className="py-8 lg:py-12">
          <Breadcrumbs
            items={[
              { label: "Home", href: "/" },
              { label: "Cart", href: "/cart" },
              { label: "Checkout" },
            ]}
          />
          <h1 className={cn(pageTitleClass, "mt-8")}>Checkout</h1>
          <p className="mt-3 max-w-[60ch] text-[13px] leading-5 text-ink/55">
            Every price below is recalculated on the server when you place the
            order. Payment is simulated for this demo.
          </p>
        </Container>
      </section>

      <Container className="py-8 lg:py-12">
        {items.length === 0 ? (
          <div className="border-t border-rule py-16 text-center">
            <p className="text-[16px] leading-6 text-ink">
              Your cart is empty.
            </p>
            <p className="mx-auto mt-2 max-w-[42ch] text-[13px] leading-5 text-ink/55">
              Add something to the cart before checking out.
            </p>
            <Link href="/" className={`${primaryButtonClass} mt-6`}>
              Browse the catalogue
            </Link>
          </div>
        ) : (
          <div className="grid gap-12 lg:grid-cols-12 lg:gap-16">
            <div className="flex flex-col gap-10 lg:col-span-7">
              <section>
                <h2 className={sectionTitleClass}>Delivery method</h2>
                <form action={chooseDeliveryMethod} className="mt-5">
                  <div className="grid gap-3 sm:grid-cols-2">
                    {(
                      [
                        {
                          value: "STANDARD",
                          title: "Standard",
                          copy:
                            standardShipping === 0
                              ? "Free — arrives in 3–5 business days."
                              : `${formatPrice(standardShipping)} — arrives in 3–5 business days.`,
                        },
                        {
                          value: "EXPRESS",
                          title: "Express",
                          copy: `${formatPrice(EXPRESS_SHIPPING_CENTS)} — arrives in 1–2 business days.`,
                        },
                      ] as const
                    ).map((option) => {
                      const selected = deliveryMethod === option.value;
                      return (
                        <button
                          key={option.value}
                          type="submit"
                          name="deliveryMethod"
                          value={option.value}
                          aria-pressed={selected}
                          className={cn(
                            "border p-4 text-left transition-colors",
                            selected
                              ? "border-ink bg-surface"
                              : "border-rule hover:border-ink/40",
                          )}
                        >
                          <span className="block text-[14px] leading-5 text-ink">
                            {option.title}
                          </span>
                          <span className="mt-1 block text-[13px] leading-5 text-ink/55">
                            {option.copy}
                          </span>
                        </button>
                      );
                    })}
                  </div>
                  <p className="mt-3 text-[13px] leading-5 text-ink/45">
                    {shippingRuleCopy()}
                  </p>
                </form>
              </section>

              <section>
                <h2 className={sectionTitleClass}>
                  {addresses.length === 0 ? "Delivery address" : "Deliver to"}
                </h2>

                {addresses.length > 0 ? (
                  <p className="mt-3 text-[13px] leading-5 text-ink/55">
                    Choose one of your saved addresses below, or add another.
                  </p>
                ) : null}

                <div className="mt-5">
                  <details open={addresses.length === 0}>
                    <summary className="cursor-pointer text-[13px] leading-5 text-ink/65 underline decoration-rule underline-offset-4 hover:decoration-ink">
                      {addresses.length === 0
                        ? "Add a delivery address"
                        : "Add a new address"}
                    </summary>
                    <div className="mt-5 border border-rule p-5">
                      <AddressForm action={addAddress} submitLabel="Save address" />
                    </div>
                  </details>
                </div>
              </section>

              <section>
                <h2 className={sectionTitleClass}>Place the order</h2>
                <div className="mt-5">
                  <CheckoutForm
                    addresses={checkoutAddresses}
                    cartVersion={version}
                  />
                </div>
              </section>
            </div>

            <aside className="lg:col-span-5">
              <div className="border-t border-rule pt-6 lg:sticky lg:top-28">
                <h2 className={sectionTitleClass}>Order summary</h2>

                <ul className="mt-5 border-t border-rule">
                  {items.map((item) => (
                    <li
                      key={item.id}
                      className="flex items-start justify-between gap-4 border-b border-rule py-4"
                    >
                      <div className="min-w-0">
                        <p className={eyebrowClass}>
                          {item.variant.product.brand.name}
                        </p>
                        <p className="mt-1 text-[13px] leading-5 text-ink">
                          {item.variant.product.title}
                        </p>
                        <p className="mt-1 text-[12px] leading-4 text-ink/45">
                          {item.variant.title} · Qty {item.quantity}
                        </p>
                      </div>
                      <p className="shrink-0 text-[13px] tabular-nums text-ink/70">
                        {formatPrice(item.variant.priceCents * item.quantity)}
                      </p>
                    </li>
                  ))}
                </ul>

                <dl className="mt-5 flex flex-col gap-3 text-[14px] leading-5">
                  <div className="flex items-baseline justify-between gap-4">
                    <dt className="text-ink/60">Subtotal</dt>
                    <dd className="tabular-nums text-ink">
                      {formatPrice(totals.subtotalCents)}
                    </dd>
                  </div>
                  <div className="flex items-baseline justify-between gap-4">
                    <dt className="text-ink/60">
                      Shipping ({deliveryMethod === "EXPRESS" ? "Express" : "Standard"})
                    </dt>
                    <dd className="tabular-nums text-ink">
                      {totals.shippingCents === 0
                        ? "Free"
                        : formatPrice(totals.shippingCents)}
                    </dd>
                  </div>
                </dl>

                <div className="mt-5 flex items-baseline justify-between gap-4 border-t border-rule pt-5">
                  <span className="text-[14px] text-ink">Total</span>
                  <span className="text-[20px] leading-7 tabular-nums text-accent">
                    {formatPrice(totals.totalCents)}
                  </span>
                </div>

                <p className="mt-4 text-[13px] leading-5 text-ink/50">
                  Totals are recalculated from the catalogue at checkout. The
                  amount shown here is the amount the server will charge.
                </p>
              </div>
            </aside>
          </div>
        )}
      </Container>
    </div>
  );
}
