import Link from "next/link";
import type { ReactNode } from "react";

import { cn } from "@/lib/utils";

export function Container({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "mx-auto w-full max-w-[1280px] px-6 lg:px-10",
        className,
      )}
    >
      {children}
    </div>
  );
}

export interface BreadcrumbItem {
  label: string;
  href?: string;
}

export function Breadcrumbs({ items }: { items: BreadcrumbItem[] }) {
  return (
    <nav aria-label="Breadcrumb">
      <ol className="flex flex-wrap items-center gap-x-2 gap-y-1 text-[11px] uppercase leading-4 tracking-[0.14em] text-ink/50">
        {items.map((item, index) => {
          const isLast = index === items.length - 1;
          return (
            <li key={`${item.label}-${index}`} className="flex items-center gap-2">
              {item.href !== undefined && !isLast ? (
                <Link
                  href={item.href}
                  className="transition-colors hover:text-ink"
                >
                  {item.label}
                </Link>
              ) : (
                <span
                  aria-current={isLast ? "page" : undefined}
                  className={isLast ? "text-ink/70" : undefined}
                >
                  {item.label}
                </span>
              )}
              {!isLast ? (
                <span aria-hidden="true" className="text-ink/30">
                  /
                </span>
              ) : null}
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
