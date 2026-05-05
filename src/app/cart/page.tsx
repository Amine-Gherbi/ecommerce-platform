import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";

import { CartLineControls } from "@/components/store/cart-line-controls";
import { Breadcrumbs, Container } from "@/components/store/ui";
import { getCartData } from "@/lib/cart";
import {
  eyebrowClass,
  pageTitleClass,
  primaryButtonClass,
  sectionTitleClass,
  textLinkClass,
} from "@/lib/styles";
import { cn } from "@/lib/utils";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Cart",
};

export default async function CartPage() {
  const cart = await getCartData();
  const isEmpty = cart.items.length === 0;

  return (
    <div>
      <section className="border-b border-rule">
        <Container className="py-8 lg:py-12">
          <Breadcrumbs
            items={[
              { label: "Home", href: "/" },
              { label: "Cart" },
            ]}
          />
          <div className="mt-8 flex flex-wrap items-end justify-between gap-4">
            <div>
              <h1 className={pageTitleClass}>Cart</h1>
              <p className="mt-3 text-[13px] leading-5 text-ink/55">
                {cart.itemCount} {cart.itemCount === 1 ? "item" : "items"}
              </p>
            </div>
            {!isEmpty ? (
              <Link
                href="/"
                className={cn("text-[13px] text-ink/60", textLinkClass)}
              >
                Continue shopping
              </Link>
            ) : null}
          </div>
        </Container>
      </section>

      <Container className="py-8 lg:py-12">
        {isEmpty ? (
          <div className="border-t border-rule py-16 text-center">
            <p className="text-[16px] leading-6 text-ink">Your cart is empty.</p>
            <p className="mx-auto mt-2 max-w-[42ch] text-[13px] leading-5 text-ink/55">
              Browse the catalogue to add headphones, speakers, a turntable or
              an accessory.
            </p>
            <Link href="/" className={`${primaryButtonClass} mt-6`}>
              Go to the shop
            </Link>
          </div>
        ) : (
          <div className="grid gap-12 lg:grid-cols-12 lg:gap-16">
            <div className="lg:col-span-8">
              <ul className="border-t border-rule">
                {cart.items.map((item) => (
                  <li
                    key={item.id}
                    className="grid grid-cols-[96px_1fr] gap-4 border-b border-rule py-6 md:grid-cols-[128px_1fr] md:gap-6"
                  >
                    <Link
                      href={`/p/${item.productSlug}`}
                      className="block self-start"
                    >
                      <div className="relative aspect-[4/5] overflow-hidden border border-rule bg-surface">
                        {item.image !== null ? (
                          <Image
                            src={item.image.url}
                            alt={item.image.alt}
                            fill
                            sizes="128px"
                            className="object-cover"
                          />
                        ) : (
                          <div className="flex h-full items-center justify-center text-[11px] text-ink/40">
                            No image
                          </div>
                        )}
                      </div>
                    </Link>

                    <div className="flex min-w-0 flex-col gap-4">
                      <div className="flex flex-wrap items-start justify-between gap-4">
                        <div className="min-w-0">
                          <p className={eyebrowClass}>{item.brandName}</p>
                          <Link
                            href={`/p/${item.productSlug}`}
                            className="mt-1 block text-[14px] leading-5 text-ink underline decoration-transparent underline-offset-4 transition-colors hover:decoration-rule"
                          >
                            {item.productTitle}
                          </Link>
                          <p className="mt-1 text-[13px] leading-5 text-ink/50">
                            {item.variantTitle}
                          </p>
                        </div>
                        <div className="shrink-0 text-right">
                          <p className="text-[13px] leading-5 text-ink/50">
                            {item.unitPrice} each
                          </p>
                          <p className="mt-1 text-[14px] leading-5 text-accent">
                            {item.lineTotal}
                          </p>
                        </div>
                      </div>

                      <CartLineControls
                        itemId={item.id}
                        quantity={item.quantity}
                        maxQuantity={item.maxQuantity}
                      />
                    </div>
                  </li>
                ))}
              </ul>
            </div>

            <aside className="lg:col-span-4">
              <div className="border-t border-rule pt-6 lg:sticky lg:top-28">
                <h2 className={sectionTitleClass}>Order summary</h2>

                <dl className="mt-6 flex flex-col gap-3 text-[14px] leading-5">
                  <div className="flex items-baseline justify-between gap-4">
                    <dt className="text-ink/60">Subtotal</dt>
                    <dd className="text-ink">{cart.subtotal}</dd>
                  </div>
                  <div className="flex items-baseline justify-between gap-4">
                    <dt className="text-ink/60">Shipping</dt>
                    <dd className="text-ink">{cart.shipping}</dd>
                  </div>
                </dl>

                <p className="mt-3 text-[13px] leading-5 text-ink/50">
                  {cart.shippingRule}
                </p>

                <div className="mt-6 flex items-baseline justify-between gap-4 border-t border-rule pt-5">
                  <span className="text-[14px] text-ink">Total</span>
                  <span className="text-[20px] leading-7 text-accent">
                    {cart.total}
                  </span>
                </div>

                <Link
                  href="/checkout"
                  className={`${primaryButtonClass} mt-6 w-full`}
                >
                  Continue to checkout
                </Link>

                <p className="mt-4 text-[13px] leading-5 text-ink/50">
                  Totals are recalculated on the server at checkout.
                </p>
              </div>
            </aside>
          </div>
        )}
      </Container>
    </div>
  );
}
