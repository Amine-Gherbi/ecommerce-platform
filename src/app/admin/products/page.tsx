import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";

import { auth } from "@/auth";
import { listProductsForAdmin } from "@/lib/admin";

import { setProductArchivedAction } from "./actions";

// Admin product list: read plus one toggle. No create, update fields,
// uploads, rich text or delete. Archiving sets `archivedAt`; order history
// lives in `OrderItem` snapshots and is not touched.

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Products",
  description: "Archive and restore products without touching order history.",
  robots: { index: false, follow: false },
};

export default async function AdminProductsPage() {
  const session = await auth();
  if (session?.user?.role !== "ADMIN") {
    redirect("/login");
  }

  const products = await listProductsForAdmin();

  return (
    <main className="mx-auto w-full max-w-6xl px-4 py-8">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Products</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Archive is a soft delete. Variants are archived with the product;
            orders keep their snapshots.
          </p>
        </div>
        <Link href="/admin/orders" className="text-sm underline">
          Orders
        </Link>
      </div>

      <ul className="mt-6 divide-y rounded-xl border bg-card">
        {products.map((product) => {
          const archived = product.archivedAt !== null;
          return (
            <li
              key={product.id}
              className="flex flex-wrap items-center justify-between gap-3 p-4"
            >
              <div>
                <p className="font-medium">{product.name}</p>
                <p className="text-xs text-muted-foreground">
                  {product.categoryName} · {product.variantCount} variant
                  {product.variantCount === 1 ? "" : "s"} ·{" "}
                  <span className="font-mono">{product.slug}</span>
                </p>
              </div>
              <div className="flex items-center gap-3">
                <span
                  className={
                    archived
                      ? "text-xs font-medium text-destructive"
                      : "text-xs text-muted-foreground"
                  }
                >
                  {archived ? "Archived" : "Live"}
                </span>
                <form action={setProductArchivedAction}>
                  <input
                    type="hidden"
                    name="productId"
                    value={product.id}
                  />
                  <input
                    type="hidden"
                    name="archive"
                    value={archived ? "false" : "true"}
                  />
                  <button
                    type="submit"
                    className="inline-flex h-8 items-center rounded-md border border-input bg-background px-3 text-sm font-medium shadow-sm hover:bg-accent"
                  >
                    {archived ? "Restore" : "Archive"}
                  </button>
                </form>
              </div>
            </li>
          );
        })}
      </ul>
    </main>
  );
}
