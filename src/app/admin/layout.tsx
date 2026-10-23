import type { Metadata } from "next";
import Link from "next/link";
import type { ReactNode } from "react";

import { Container } from "@/components/store/ui";
import { requireAdmin } from "@/lib/admin";
import { eyebrowClass, focusRing } from "@/lib/styles";
import { cn } from "@/lib/utils";

export const metadata: Metadata = {
  title: {
    default: "Admin",
    template: "%s · Admin · Kestrel Audio",
  },
};

const TABS = [
  { href: "/admin", label: "Dashboard" },
  { href: "/admin/orders", label: "Orders" },
  { href: "/admin/products", label: "Products" },
  { href: "/admin/inventory", label: "Inventory" },
] as const;

// The layout checks too, but every page repeats the check. Layouts can be
// reused across navigations; a page render is the boundary that must never
// show admin data to a customer.
export default async function AdminLayout({
  children,
}: {
  children: ReactNode;
}) {
  await requireAdmin("/admin");

  return (
    <div>
      <section className="border-b border-rule">
        <Container className="flex flex-wrap items-center justify-between gap-4 py-4">
          <p className={eyebrowClass}>Admin console</p>
          <nav aria-label="Admin" className="flex flex-wrap items-center gap-5">
            {TABS.map((tab) => (
              <Link
                key={tab.href}
                href={tab.href}
                className={cn(
                  "text-[13px] leading-5 text-ink/60 transition-colors hover:text-ink",
                  focusRing,
                )}
              >
                {tab.label}
              </Link>
            ))}
          </nav>
        </Container>
      </section>

      <Container className="py-8 lg:py-12">{children}</Container>
    </div>
  );
}
