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
        <Container className="py-8 lg:py-10">
          <Breadcrumbs
            items={[
              { label: "Home", href: "/" },
              { label: "Cart" },
            ]}
          />
          <div className="mt-7">
            <h1 className={pageTitleClass}>Cart</h1>
            <div className="mt-3 flex flex-wrap items-center gap-x-5 gap-y-2 text-[13px] leading-5 text-ink/55">
              <p>
                {cart.itemCount} {cart.itemCount === 1 ? "item" : "items"}
              </p>
              {!isEmpty ? (
                <Link href="/" className={cn("text-ink/65", textLinkClass)}>
                  Continue shopping
                </Link>
              ) : null}
            </div>
          </div>
        </Container>
      </section>

      <Container className="py-8 lg:py-10">
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
              {/* Mobile: stacked lines with the same fields as the table. */}
              <ul className="border-t border-rule lg:hidden">
                {cart.items.map((item) => (
                  <li
                    key={item.id}
                    className="grid grid-cols-[96px_1fr] gap-4 border-b border-rule py-6"
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
                            sizes="96px"
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
                      <div>
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
                        <div className="mt-2 flex items-baseline justify-between gap-4">
                          <p className="text-[13px] tabular-nums text-ink/55">
                            {item.unitPrice} each
                          </p>
                          <p className="text-[14px] tabular-nums text-ink">
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

              {/* Desktop: Item / Price / Quantity / Total. */}
              <table className="hidden w-full table-fixed border-collapse text-left lg:table">
                <caption className="sr-only">Cart items</caption>
                <colgroup>
                  <col />
                  <col className="w-[120px]" />
                  <col className="w-[180px]" />
                  <col className="w-[120px]" />
                </colgroup>
                <thead>
                  <tr className="border-y border-rule text-[11px] uppercase leading-4 tracking-[0.14em] text-ink/50">
                    <th scope="col" className="h-11 py-3 pr-6 font-medium">
                      Item
                    </th>
                    <th
                      scope="col"
                      className="h-11 py-3 pr-6 text-right font-medium"
                    >
                      Price
                    </th>
                    <th scope="col" className="h-11 py-3 pl-8 font-medium">
                      Quantity
                    </th>
                    <th scope="col" className="h-11 py-3 text-right font-medium">
                      Total
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {cart.items.map((item) => (
                    <tr key={item.id} className="border-b border-rule align-top">
                      <td className="py-6 pr-6">
                        <div className="flex gap-5">
                          <Link
                            href={`/p/${item.productSlug}`}
                            className="block w-24 shrink-0 self-start"
                          >
                            <div className="relative aspect-[4/5] overflow-hidden border border-rule bg-surface">
                              {item.image !== null ? (
                                <Image
                                  src={item.image.url}
                                  alt={item.image.alt}
                                  fill
                                  sizes="96px"
                                  className="object-cover"
                                />
                              ) : (
                                <div className="flex h-full items-center justify-center text-[11px] text-ink/40">
                                  No image
                                </div>
                              )}
                            </div>
                          </Link>

                          <div className="min-w-0 pt-0.5">
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
                            {item.inStock ? null : (
                              <p className="mt-2 text-[11px] uppercase leading-4 tracking-[0.14em] text-ink/45">
                                Sold out
                              </p>
                            )}
                          </div>
                        </div>
                      </td>
                      <td className="py-6 pr-6 text-right text-[14px] leading-5 tabular-nums text-ink">
                        {item.unitPrice}
                        <span className="mt-1 block text-[11px] uppercase leading-4 tracking-[0.12em] text-ink/45">
                          each
                        </span>
                      </td>
                      <td className="py-6 pl-8">
                        <CartLineControls
                          itemId={item.id}
                          quantity={item.quantity}
                          maxQuantity={item.maxQuantity}
                        />
                      </td>
                      <td className="py-6 text-right text-[14px] leading-5 tabular-nums text-ink">
                        {item.lineTotal}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <aside className="lg:col-span-4 lg:pt-11">
              <div className="border-t border-rule pt-6 lg:sticky lg:top-28">
                <h2 className={sectionTitleClass}>Order summary</h2>

                <dl className="mt-6 flex flex-col gap-3 text-[14px] leading-5">
                  <div className="flex items-baseline justify-between gap-4">
                    <dt className="text-ink/60">Subtotal</dt>
                    <dd className="tabular-nums text-ink">{cart.subtotal}</dd>
                  </div>
                  <div className="flex items-baseline justify-between gap-4">
                    <dt className="text-ink/60">Shipping</dt>
                    <dd className="tabular-nums text-ink">{cart.shipping}</dd>
                  </div>
                </dl>

                <p className="mt-3 text-[13px] leading-5 text-ink/50">
                  {cart.shippingRule}
                </p>

                <div className="mt-6 flex items-baseline justify-between gap-4 border-t border-rule pt-5">
                  <span className="text-[14px] text-ink">Total</span>
                  <span className="text-[20px] leading-7 tabular-nums text-ink">
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
                  The final total is confirmed when you place your order.
                </p>
              </div>
            </aside>
          </div>
        )}
      </Container>
    </div>
  );
}
