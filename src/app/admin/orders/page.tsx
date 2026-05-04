import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";

import { auth } from "@/auth";
import { listOrdersForAdmin } from "@/lib/orders";

import { OrderTable, StateMachineLegend } from "./order-table";

// Admin order console: read-only. The only admin mutation in the app is the
// product archive toggle under /admin/products.
//
// `auth()` is called in this leaf page, never in `app/layout.tsx` — the layout
// would make every storefront route dynamic and destroy the caching target.
// The page is intentionally dynamic: it renders order state, not catalog copy.

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Orders",
  description: "Read-only order console with the state machine visible.",
  robots: { index: false, follow: false },
};

export default async function AdminOrdersPage() {
  const session = await auth();
  if (session?.user?.role !== "ADMIN") {
    redirect("/login");
  }

  const orders = await listOrdersForAdmin();
  const refundRequired = orders.filter(
    (order) => order.status === "REFUND_REQUIRED",
  ).length;

  return (
    <main className="mx-auto w-full max-w-6xl px-4 py-8">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Orders</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Read-only. Order history renders from {""}
            <code>OrderItem</code> snapshots, so archiving a product never
            changes it.
          </p>
        </div>
        <Link href="/admin/products" className="text-sm underline">
          Products and archive
        </Link>
      </div>

      <section
        className="mt-6 rounded-xl border bg-card p-4"
        aria-labelledby="state-machine-heading"
      >
        <h2 id="state-machine-heading" className="text-sm font-semibold">
          Order state machine
        </h2>
        <p className="mt-1 text-xs text-muted-foreground">
          Transitions are applied as{" "}
          <code>UPDATE … WHERE id = $1 AND status = $2</code>; zero rows is a
          lost race and is logged, never retried.
        </p>
        <StateMachineLegend />
      </section>

      <p className="mt-6 text-sm text-muted-foreground">
        {orders.length} order{orders.length === 1 ? "" : "s"} ·{" "}
        {refundRequired} awaiting refund
      </p>

      <OrderTable orders={orders} />
    </main>
  );
}
