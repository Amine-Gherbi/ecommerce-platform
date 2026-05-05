import type { ReactNode } from "react";
import Link from "next/link";

import { Container } from "@/components/store/ui";
import { eyebrowClass, focusRing } from "@/lib/styles";
import { cn } from "@/lib/utils";

const TABS = [
  { href: "/account", label: "Overview" },
  { href: "/account/orders", label: "Orders" },
  { href: "/account/addresses", label: "Addresses" },
] as const;

export default function AccountLayout({
  children,
}: {
  children: ReactNode;
}) {
  return (
    <div>
      <section className="border-b border-rule bg-surface">
        <Container className="flex flex-wrap items-center justify-between gap-4 py-4">
          <p className={eyebrowClass}>Account</p>
          <nav aria-label="Account" className="flex items-center gap-5">
            {TABS.map((tab) => (
              <Link
                key={tab.href}
                href={tab.href}
                className={cn(
                  "text-[11px] font-semibold uppercase leading-4 tracking-[0.14em] text-muted transition-colors hover:text-ink",
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
