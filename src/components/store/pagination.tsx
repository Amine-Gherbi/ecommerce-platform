import Link from "next/link";

function pageHref(basePath: string, baseQuery: string, page: number): string {
  const params = new URLSearchParams(baseQuery);
  if (page > 1) {
    params.set("page", String(page));
  } else {
    params.delete("page");
  }
  const query = params.toString();
  return query.length > 0 ? `${basePath}?${query}` : basePath;
}

export function Pagination({
  page,
  pageCount,
  basePath,
  baseQuery,
}: {
  page: number;
  pageCount: number;
  basePath: string;
  baseQuery: string;
}) {
  if (pageCount <= 1) {
    return null;
  }

  const pages = Array.from({ length: pageCount }, (_, index) => index + 1);

  return (
    <nav
      aria-label="Pagination"
      className="mt-12 flex flex-wrap items-center justify-between gap-6 border-t border-rule pt-6 lg:mt-16"
    >
      <p className="text-[13px] uppercase tracking-[0.14em] text-muted">
        Page {page} of {pageCount}
      </p>
      <div className="flex items-center gap-5">
        {page > 1 ? (
          <Link
            href={pageHref(basePath, baseQuery, page - 1)}
            className="inline-flex min-h-11 items-center text-[13px] uppercase tracking-[0.14em] text-ink underline decoration-rule underline-offset-4 hover:decoration-ink"
          >
            Previous
          </Link>
        ) : null}
        <div className="flex items-center gap-4">
          {pages.map((pageNumber) => (
            <Link
              key={pageNumber}
              href={pageHref(basePath, baseQuery, pageNumber)}
              aria-current={pageNumber === page ? "page" : undefined}
              className={
                pageNumber === page
                  ? "inline-flex min-h-11 min-w-6 items-center justify-center text-[13px] tabular-nums text-ink underline decoration-ink underline-offset-4"
                  : "inline-flex min-h-11 min-w-6 items-center justify-center text-[13px] tabular-nums text-muted underline decoration-transparent underline-offset-4 hover:text-ink hover:decoration-rule"
              }
            >
              {pageNumber}
            </Link>
          ))}
        </div>
        {page < pageCount ? (
          <Link
            href={pageHref(basePath, baseQuery, page + 1)}
            className="inline-flex min-h-11 items-center text-[13px] uppercase tracking-[0.14em] text-ink underline decoration-rule underline-offset-4 hover:decoration-ink"
          >
            Next
          </Link>
        ) : null}
      </div>
    </nav>
  );
}
