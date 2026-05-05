import Link from "next/link";

import { Container } from "./ui";

export function SiteFooter() {
  return (
    <footer className="border-t border-rule">
      <Container className="flex flex-col gap-2 py-8 text-[13px] leading-5 text-ink/55 sm:flex-row sm:items-center sm:justify-between">
        <p>Demo store. Catalogue data and prices are fictional.</p>
        <Link
          href="/credits"
          className="underline decoration-rule underline-offset-4 transition-colors hover:text-ink hover:decoration-ink"
        >
          Photography credits
        </Link>
      </Container>
    </footer>
  );
}
