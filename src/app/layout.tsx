import type { Metadata } from "next";
import Link from "next/link";

import "./globals.css";

export const metadata: Metadata = {
  title: {
    default: "Alder & Co.",
    template: "%s · Alder & Co.",
  },
  description: "A small storefront built around money correctness.",
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body className="min-h-dvh antialiased">
        <header className="border-b">
          <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-4">
            <Link href="/" className="text-lg font-semibold tracking-tight">
              Alder &amp; Co.
            </Link>
          </div>
        </header>
        {children}
        <footer className="mx-auto max-w-6xl px-4 py-10 text-sm text-muted-foreground">
          Prices are integers in cents on the wire and in the database.
        </footer>
      </body>
    </html>
  );
}
