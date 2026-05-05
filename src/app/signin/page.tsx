import type { Metadata } from "next";
import Link from "next/link";

import { Container } from "@/components/store/ui";
import { safeNextPath } from "@/lib/session";
import {
  eyebrowClass,
  pageTitleClass,
  textLinkClass,
} from "@/lib/styles";
import { cn } from "@/lib/utils";

import { SignInForm } from "./sign-in-form";

export const metadata: Metadata = {
  title: "Sign in",
};

interface SignInPageProps {
  searchParams: Promise<{ next?: string | string[] }>;
}

export default async function SignInPage({ searchParams }: SignInPageProps) {
  const query = await searchParams;
  const next = safeNextPath(query.next);

  return (
    <Container className="py-10 lg:py-16">
      <div className="mx-auto w-full max-w-[420px]">
        <p className={eyebrowClass}>Your account</p>
        <h1 className={cn(pageTitleClass, "mt-3")}>Sign in</h1>
        <p className="mt-3 text-[13px] leading-5 text-ink/55">
          Sign in to see your orders, manage addresses and keep your cart.
        </p>

        <SignInForm next={next} />

        <p className="mt-6 text-[13px] leading-5 text-ink/60">
          New here?{" "}
          <Link href="/signup" className={cn("text-ink", textLinkClass)}>
            Create an account
          </Link>
          .
        </p>

        <aside className="mt-10 border border-rule bg-ink/[0.02] p-4">
          <p className="text-[11px] uppercase leading-4 tracking-[0.14em] text-ink/45">
            Demo accounts
          </p>
          <ul className="mt-2 flex flex-col gap-1 text-[12px] leading-5 text-ink/50">
            <li>
              <code className="text-ink/60">demo@kestrel.test</code>
              {" / "}
              <code className="text-ink/60">demo-password-123</code>
            </li>
            <li>
              <code className="text-ink/60">admin@kestrel.test</code>
              {" / "}
              <code className="text-ink/60">admin-password-123</code>
            </li>
          </ul>
        </aside>
      </div>
    </Container>
  );
}
