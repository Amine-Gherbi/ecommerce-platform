import type { Metadata } from "next";

import { SiteFooter } from "@/components/store/site-footer";
import { SiteHeader } from "@/components/store/site-header";

import "./globals.css";

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
          <a
            href="#content"
            className="sr-only focus:not-sr-only focus:absolute focus:left-6 focus:top-4 focus:z-50 focus:border focus:border-ink focus:bg-ink focus:px-4 focus:py-3 focus:text-[11px] focus:uppercase focus:tracking-[0.14em] focus:text-surface"
          >
            Skip to content
          </a>
          <SiteHeader />
          <main id="content" className="flex-1">
            {children}
          </main>
          <SiteFooter />
        </div>
      </body>
    </html>
  );
}
