import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";

import { auth } from "@/auth";
import { buttonVariants } from "@/components/ui/button";
import { getCurrentCart } from "@/lib/cart";
import { cartVersionOf } from "@/lib/checkout";
import { formatCents } from "@/lib/format";

import { CheckoutForm } from "./checkout-form";

// Order preview. Every number on this page is read from Postgres; the client
// component below sends `{addressId, cartVersion}` and nothing else. The page
// is a leaf: `auth()` lives here, not in the root layout.

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Checkout",
  description: "Order preview with totals recomputed from the database.",
};

export default async function CheckoutPage() {
  const session = await auth();
  if (session?.user?.id === undefined) {
    redirect("/login");
  }

  const cart = await getCurrentCart(session.user.id);
  if (cart.id === null || cart.items.length === 0) {
    return (
      <main className="mx-auto w-full max-w-2xl px-4 py-8">
        <h1 className="text-2xl font-semibold tracking-tight">Checkout</h1>
        <div className="mt-8 rounded-xl border border-dashed p-10 text-center">
          <h2 className="text-lg font-semibold">Your cart is empty</h2>
          <p className="mt-2 text-sm text-muted-foreground">
            Add a variant before checking out.
          </p>
          <Link href="/" className={buttonVariants({ className: "mt-5" })}>
            Browse the catalog
          </Link>
        </div>
      </main>
    );
  }

  const cartVersion = cartVersionOf(
    cart.items.map((item) => ({
      variantId: item.variantId,
      quantity: item.quantity,
    })),
  );

  return (
    <main className="mx-auto w-full max-w-3xl px-4 py-8">
      <h1 className="text-2xl font-semibold tracking-tight">Checkout</h1>
      <p className="mt-1 text-sm text-muted-foreground">
        The total below is computed by{" "}
        <code>computeTotals</code> from <code>Variant.priceCents</code>. The
        request sends the cart version, not a price.
      </p>

      <section
        className="mt-6 rounded-xl border bg-card"
        aria-labelledby="order-preview-heading"
      >
        <h2
          id="order-preview-heading"
          className="border-b px-4 py-3 text-sm font-semibold"
        >
          Order preview
        </h2>
        <ul className="divide-y">
          {cart.items.map((item) => (
            <li
              key={item.id}
              className="flex flex-wrap items-center justify-between gap-3 px-4 py-3 text-sm"
            >
              <div>
                <p className="font-medium">{item.productName}</p>
                <p className="text-xs text-muted-foreground">
                  {item.variantName} · SKU {item.sku} · {item.quantity} ×{" "}
                  {formatCents(item.unitPriceCents)}
                </p>
              </div>
              <span className="tabular-nums">
                {formatCents(item.lineTotalCents)}
              </span>
            </li>
          ))}
        </ul>
        <dl className="grid gap-2 border-t px-4 py-4 text-sm">
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
            <dd
              className="tabular-nums"
              data-testid="checkout-total"
              data-total-cents={cart.totals.totalCents}
              data-cart-version={cartVersion}
            >
              {formatCents(cart.totals.totalCents)}
            </dd>
          </div>
        </dl>
      </section>

      <CheckoutForm
        cartVersion={cartVersion}
        totalCents={cart.totals.totalCents}
      />

      <p className="mt-6 text-xs text-muted-foreground">
        Payment is created in Stripe test mode when{" "}
        <code>STRIPE_SECRET_KEY</code> is set; without it the checkout still
        creates the order and a local <code>pi_local_*</code> intent, which is
        why the concurrency and reservation tests can run offline.
      </p>
    </main>
  );
}
