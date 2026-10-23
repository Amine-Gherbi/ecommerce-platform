import type { Metadata } from "next";
import Link from "next/link";

import { Container } from "@/components/store/ui";
import {
  eyebrowClass,
  pageTitleClass,
  textLinkClass,
} from "@/lib/styles";
import { cn } from "@/lib/utils";

import { SignUpForm } from "./sign-up-form";

export const metadata: Metadata = {
  title: "Create account",
};

export default function SignUpPage() {
  return (
    <Container className="py-10 lg:py-16">
      <div className="mx-auto w-full max-w-[420px]">
        <p className={eyebrowClass}>Your account</p>
        <h1 className={cn(pageTitleClass, "mt-3")}>Create account</h1>
        <p className="mt-3 text-[13px] leading-5 text-ink/55">
          An account keeps your orders and addresses together.
        </p>

        <SignUpForm />

        <p className="mt-6 text-[13px] leading-5 text-ink/60">
          Already have an account?{" "}
          <Link href="/signin" className={cn("text-ink", textLinkClass)}>
            Sign in
          </Link>
          .
        </p>
      </div>
    </Container>
  );
}
