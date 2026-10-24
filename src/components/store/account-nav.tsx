import Link from "next/link";

import { signOutAction } from "@/app/account/actions";
import { auth } from "@/auth";
import { firstName } from "@/lib/account";
import { focusRing } from "@/lib/styles";
import { cn } from "@/lib/utils";

const menuLinkClass =
  "flex min-h-11 items-center px-4 text-[11px] font-semibold uppercase leading-none tracking-[0.14em] text-ink transition-colors hover:text-accent";

function UserIcon() {
  return (
    <svg
      viewBox="0 0 16 16"
      className="size-4 shrink-0"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.35"
      aria-hidden="true"
    >
      <circle cx="8" cy="5" r="2.5" />
      <path d="M2.75 14c0-2.9 2.35-4.5 5.25-4.5s5.25 1.6 5.25 4.5" />
    </svg>
  );
}

export function AccountNavFallback() {
  return (
    <Link
      href="/signin"
      className="inline-flex min-h-11 items-center gap-2 text-[11px] font-semibold uppercase leading-none tracking-[0.14em] text-ink transition-colors hover:text-accent"
    >
      <UserIcon />
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
          "flex min-h-11 cursor-pointer list-none items-center gap-2 text-[11px] font-semibold uppercase leading-none tracking-[0.14em] text-ink transition-colors hover:text-accent",
          focusRing,
        )}
      >
        <UserIcon />
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

      <div className="absolute right-0 top-full z-50 mt-1 w-52 border border-rule bg-page py-1">
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
            className={cn(menuLinkClass, "w-full text-left")}
          >
            Sign out
          </button>
        </form>
      </div>
    </details>
  );
}
