import type { Metadata } from "next";
import Link from "next/link";

import { auth } from "@/auth";
import { Button, buttonVariants } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { getCurrentCart } from "@/lib/cart";
import { formatCents } from "@/lib/format";

import {
  removeCartItemAction,
  updateCartItemAction,
} from "./actions";

export const metadata: Metadata = {
  title: "Cart",
  description: "Your cart, priced server-side in integer cents.",
};

// A leaf page, not the layout: reading the session here makes this route
// dynamic without making every other route dynamic.
export const dynamic = "force-dynamic";

export default async function CartPage() {
  const session = await auth();
  const cart = await getCurrentCart(session?.user?.id ?? null);

  return (
    <main className="mx-auto w-full max-w-4xl px-4 py-8">
      <h1 className="text-2xl font-semibold tracking-tight">Cart</h1>
      <p className="mt-1 text-sm text-muted-foreground">
        Prices and totals are recomputed from Postgres on every request. Stock
        caps the quantity that can be charged.
      </p>

      {cart.items.length === 0 ? (
        <div className="mt-8 rounded-xl border border-dashed p-10 text-center">
          <h2 className="text-lg font-semibold">Your cart is empty</h2>
          <Link href="/" className={buttonVariants({ className: "mt-5" })}>
            Browse the catalog
          </Link>
        </div>
      ) : (
        <>
          <ul className="mt-8 divide-y rounded-xl border bg-card">
            {cart.items.map((item) => (
              <li
                key={item.id}
                className="flex flex-col gap-4 p-4 sm:flex-row sm:items-center sm:justify-between"
              >
                <div>
                  <Link
                    href={`/products/${item.productSlug}`}
                    className="font-medium hover:underline"
                  >
                    {item.productName}
                  </Link>
                  <p className="text-sm text-muted-foreground">
                    {item.variantName} · SKU {item.sku}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {formatCents(item.unitPriceCents)} each · {item.stock} in
                    stock
                  </p>
                </div>

                <div className="flex flex-wrap items-center gap-3">
                  <form action={updateCartItemAction} className="flex items-center gap-2">
                    <input type="hidden" name="variantId" value={item.variantId} />
                    <Input
                      name="quantity"
                      type="number"
                      inputMode="numeric"
                      min={0}
                      max={item.stock}
                      step={1}
                      defaultValue={item.quantity}
                      aria-label={`Quantity for ${item.productName}`}
                      className="h-9 w-20"
                    />
                    <Button type="submit" variant="outline" size="sm">
                      Update
                    </Button>
                  </form>

                  <form action={removeCartItemAction}>
                    <input type="hidden" name="variantId" value={item.variantId} />
                    <Button type="submit" variant="ghost" size="sm">
                      Remove
                    </Button>
                  </form>

                  <span className="w-24 text-right font-semibold tabular-nums">
                    {formatCents(item.lineTotalCents)}
                  </span>
                </div>
              </li>
            ))}
          </ul>

          <dl className="ml-auto mt-6 grid w-full max-w-sm gap-2 text-sm">
            <div className="flex justify-between">
              <dt className="text-muted-foreground">Subtotal</dt>
              <dd className="tabular-nums">
                {formatCents(cart.totals.subtotalCents)}
              </dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-muted-foreground">Discount</dt>
              <dd className="tabular-nums">
                −{formatCents(cart.totals.discountCents)}
              </dd>
            </div>
            <div className="flex justify-between border-t pt-2 text-base font-semibold">
              <dt>Total</dt>
              <dd className="tabular-nums">{formatCents(cart.totals.totalCents)}</dd>
            </div>
          </dl>
        </>
      )}
    </main>
  );
}
