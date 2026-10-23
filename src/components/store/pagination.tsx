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
      <p className="text-[13px] text-ink/55">
        Page {page} of {pageCount}
      </p>
      <div className="flex items-center gap-5">
        {page > 1 ? (
          <Link
            href={pageHref(basePath, baseQuery, page - 1)}
            className="text-[13px] text-ink/65 underline decoration-rule underline-offset-4 hover:text-ink hover:decoration-ink"
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
                  ? "text-[13px] text-ink underline decoration-ink underline-offset-4"
                  : "text-[13px] text-ink/55 underline decoration-transparent underline-offset-4 hover:text-ink hover:decoration-rule"
              }
            >
              {pageNumber}
            </Link>
          ))}
        </div>
        {page < pageCount ? (
          <Link
            href={pageHref(basePath, baseQuery, page + 1)}
            className="text-[13px] text-ink/65 underline decoration-rule underline-offset-4 hover:text-ink hover:decoration-ink"
          >
            Next
          </Link>
        ) : null}
      </div>
    </nav>
  );
}
