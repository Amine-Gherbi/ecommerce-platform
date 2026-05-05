import Link from "next/link";

import { Container } from "./ui";

const COLUMNS = [
  {
    title: "Shop",
    links: [
      { href: "/c/headphones", label: "Headphones" },
      { href: "/c/speakers", label: "Speakers" },
      { href: "/c/turntables", label: "Turntables" },
      { href: "/c/accessories", label: "Accessories" },
    ],
  },
  {
    title: "Help",
    links: [
      { href: "/search", label: "Search" },
      { href: "/cart", label: "Cart" },
      { href: "/signin", label: "Sign in" },
    ],
  },
  {
    title: "About",
    links: [
      { href: "/", label: "Kestrel Audio" },
      { href: "/credits", label: "Photography credits" },
    ],
  },
] as const;

export function SiteFooter() {
  return (
    <footer className="mt-4 bg-ink text-surface">
      <Container className="py-12">
        <div className="grid gap-10 sm:grid-cols-3">
          {COLUMNS.map((column) => (
            <div key={column.title}>
              <h2 className="text-[11px] font-semibold uppercase leading-4 tracking-[0.14em] text-footer-muted">
                {column.title}
              </h2>
              <ul className="mt-3 flex flex-col">
                {column.links.map((link) => (
                  <li key={link.href}>
                    <Link
                      href={link.href}
                      className="inline-flex min-h-9 items-center text-[13px] leading-5 text-surface underline decoration-transparent underline-offset-4 transition-colors hover:decoration-surface"
                    >
                      {link.label}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>

        <p className="mt-10 border-t border-surface/15 pt-6 text-[13px] leading-5 text-footer-muted">
          Demo store. Catalogue data and prices are fictional.
        </p>
      </Container>
    </footer>
  );
}
