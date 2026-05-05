import Link from "next/link";

import { Container } from "@/components/store/ui";
import { pageTitleClass, primaryButtonClass } from "@/lib/styles";

export default function NotFound() {
  return (
    <Container className="py-16 lg:py-24">
      <div className="border-t border-rule pt-12 text-center">
        <p className="text-[11px] uppercase tracking-[0.16em] text-ink/45">
          404
        </p>
        <h1 className={`${pageTitleClass} mt-4`}>Page not found.</h1>
        <p className="mx-auto mt-3 max-w-[42ch] text-[14px] leading-6 text-ink/60">
          The page you requested does not exist, or the product is no longer in
          the catalogue.
        </p>
        <Link href="/" className={`${primaryButtonClass} mt-8`}>
          Back to the shop
        </Link>
      </div>
    </Container>
  );
}
