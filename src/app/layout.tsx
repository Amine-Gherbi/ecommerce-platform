import type { Metadata } from "next";

import { SiteFooter } from "@/components/store/site-footer";
import { SiteHeader } from "@/components/store/site-header";

import "./globals.css";

// Every page renders through this layout, and the header reads the live
// category list from PostgreSQL. Prerendering any route at build time would
// therefore need a database in the build container — the image is built
// without one by design — and would bake today's catalogue into the HTML.
// Render the tree per request. This is segment config, not an auth() call:
// no session is read here, and the API routes set their own config.
export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: {
    default: "Kestrel Audio",
    template: "%s · Kestrel Audio",
  },
  description:
    "Kestrel Audio is a small hi-fi shop in Lyon with a short catalogue of headphones, speakers, turntables and accessories, shipped across France and the European Union.",
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body className="antialiased">
        <div className="flex min-h-dvh flex-col">
          <a href="#main" className="skip-link">
            Skip to content
          </a>
          <SiteHeader />
          <main id="main" tabIndex={-1} className="flex-1">
            {children}
          </main>
          <SiteFooter />
        </div>
      </body>
    </html>
  );
}
