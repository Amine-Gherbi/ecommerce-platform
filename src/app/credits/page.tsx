import type { Metadata } from "next";

import { Breadcrumbs, Container } from "@/components/store/ui";
import { PHOTO_CREDITS } from "@/lib/credits";
import { pageTitleClass } from "@/lib/styles";

export const metadata: Metadata = {
  title: "Photography credits",
  description: "Licensing information for the product photographs in this demo.",
};

export default function CreditsPage() {
  return (
    <div>
      <section className="border-b border-rule">
        <Container className="py-8 lg:py-12">
          <Breadcrumbs
            items={[
              { label: "Home", href: "/" },
              { label: "Photography credits" },
            ]}
          />
          <div className="mt-8 max-w-[70ch]">
            <h1 className={pageTitleClass}>Photography credits</h1>
            <p className="mt-4 text-[15px] leading-6 text-muted">
              Product names and descriptions are fictional. The photographs are
              used under the licences below and are stored in{" "}
              <span className="text-ink">public/products/</span>.
            </p>
          </div>
        </Container>
      </section>

      <Container className="py-8 lg:py-12">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[760px] border-collapse text-left text-[13px] leading-5">
            <thead>
              <tr className="border-b border-rule text-[11px] uppercase tracking-[0.14em] text-muted">
                <th scope="col" className="py-3 pr-6 font-normal">
                  Product
                </th>
                <th scope="col" className="py-3 pr-6 font-normal">
                  File
                </th>
                <th scope="col" className="py-3 pr-6 font-normal">
                  Licence
                </th>
                <th scope="col" className="py-3 pr-6 font-normal">
                  Author
                </th>
                <th scope="col" className="py-3 font-normal">
                  Source
                </th>
              </tr>
            </thead>
            <tbody>
              {PHOTO_CREDITS.map((credit) => (
                <tr
                  key={credit.file}
                  className="border-b border-rule align-top"
                >
                  <td className="py-3 pr-6 text-ink">{credit.product}</td>
                  <td className="py-3 pr-6 text-muted">{credit.file}</td>
                  <td className="whitespace-nowrap py-3 pr-6 text-muted">
                    {credit.licence}
                  </td>
                  <td className="py-3 pr-6 text-muted">{credit.author}</td>
                  <td className="py-3">
                    <a
                      href={credit.source}
                      target="_blank"
                      rel="noreferrer"
                      className="underline decoration-rule underline-offset-4 transition-colors hover:text-ink hover:decoration-ink"
                    >
                      Wikimedia Commons
                    </a>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Container>
    </div>
  );
}
