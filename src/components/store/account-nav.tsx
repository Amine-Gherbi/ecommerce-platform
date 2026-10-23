import Link from "next/link";

import { signOutAction } from "@/app/account/actions";
import { auth } from "@/auth";
import { firstName } from "@/lib/account";
import { focusRing } from "@/lib/styles";
import { cn } from "@/lib/utils";

const menuLinkClass =
  "block px-4 py-2 text-[13px] leading-5 text-ink/70 transition-colors hover:bg-ink/[0.04] hover:text-ink";

export function AccountNavFallback() {
  return (
    <Link
      href="/signin"
      className="text-[13px] text-ink/70 transition-colors hover:text-ink"
    >
      Account
    </Link>
  );
}

export async function AccountNav() {
  const session = await auth();

  if (session?.user?.id === undefined) {
    return <AccountNavFallback />;
  }

  return (
    <details className="relative">
      <summary
        className={cn(
          "flex cursor-pointer list-none items-center gap-1.5 text-[13px] text-ink transition-colors hover:text-accent",
          focusRing,
        )}
      >
        {firstName(session.user.name)}
        <svg
          viewBox="0 0 10 6"
          className="size-2.5"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.3"
          aria-hidden="true"
        >
          <path d="m1 1 4 4 4-4" strokeLinecap="round" />
        </svg>
      </summary>

      <div className="absolute right-0 top-full z-50 mt-3 w-48 border border-rule bg-surface py-1 shadow-[0_10px_30px_rgba(17,17,16,0.08)]">
        {session.user.role === "ADMIN" ? (
          <Link href="/admin" className={menuLinkClass}>
            Admin console
          </Link>
        ) : null}
        <Link href="/account" className={menuLinkClass}>
          Account overview
        </Link>
        <Link href="/account/orders" className={menuLinkClass}>
          Orders
        </Link>
        <Link href="/account/addresses" className={menuLinkClass}>
          Addresses
        </Link>
        <form action={signOutAction} className="mt-1 border-t border-rule pt-1">
          <button
            type="submit"
            className={cn(
              menuLinkClass,
              "w-full text-left text-ink/55",
            )}
          >
            Sign out
          </button>
        </form>
      </div>
    </details>
  );
}
