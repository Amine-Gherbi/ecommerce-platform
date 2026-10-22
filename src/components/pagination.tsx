import Link from "next/link";

import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export interface PaginationProps {
  page: number;
  pageSize: number;
  total: number;
  /** Server-built hrefs preserve every active filter and the page size. */
  hrefForPage: (page: number) => string;
}

/** At most five page numbers, centred on the current page where possible. */
export function pageWindow(current: number, totalPages: number, radius = 2): number[] {
  const span = radius * 2 + 1;
  const start = Math.max(1, Math.min(current - radius, totalPages - span + 1));
  const end = Math.min(totalPages, start + span - 1);

  const pages: number[] = [];
  for (let page = start; page <= end; page += 1) {
    pages.push(page);
  }
  return pages;
}

export function Pagination({ page, pageSize, total, hrefForPage }: PaginationProps) {
  if (total === 0) {
    return null;
  }

  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  // A hand-typed ?page=999 should land on the last real page, not link to 998.
  const current = Math.min(Math.max(page, 1), totalPages);
  const pages = pageWindow(current, totalPages);
  const previous = current > 1 ? hrefForPage(current - 1) : undefined;
  const next = current < totalPages ? hrefForPage(current + 1) : undefined;

  return (
    <nav
      aria-label="Pagination"
      className="mt-8 flex flex-col items-center justify-between gap-3 border-t pt-6 sm:flex-row"
    >
      <p className="text-sm text-muted-foreground">
        Page {current} of {totalPages}
      </p>
      <ul className="flex items-center gap-1">
        <li>
          {previous === undefined ? (
            <span
              aria-disabled="true"
              className={cn(buttonVariants({ variant: "outline", size: "sm" }), "opacity-50")}
            >
              Previous
            </span>
          ) : (
            <Link
              href={previous}
              className={buttonVariants({ variant: "outline", size: "sm" })}
              rel="prev"
            >
              Previous
            </Link>
          )}
        </li>
        {pages.map((pageNumber) => (
          <li key={pageNumber}>
            <Link
              href={hrefForPage(pageNumber)}
              aria-current={pageNumber === current ? "page" : undefined}
              className={cn(
                buttonVariants({
                  variant: pageNumber === current ? "default" : "ghost",
                  size: "sm",
                }),
                "tabular-nums",
              )}
            >
              {pageNumber}
            </Link>
          </li>
        ))}
        <li>
          {next === undefined ? (
            <span
              aria-disabled="true"
              className={cn(buttonVariants({ variant: "outline", size: "sm" }), "opacity-50")}
            >
              Next
            </span>
          ) : (
            <Link
              href={next}
              className={buttonVariants({ variant: "outline", size: "sm" })}
              rel="next"
            >
              Next
            </Link>
          )}
        </li>
      </ul>
    </nav>
  );
}
