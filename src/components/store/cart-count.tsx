"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useCallback, useEffect, useState } from "react";

interface CartSummaryResponse {
  count?: unknown;
}

function CartIcon() {
  return (
    <svg
      viewBox="0 0 16 16"
      className="size-4 shrink-0"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.35"
      aria-hidden="true"
    >
      <path d="M2 3h1.6l1.5 7.5h6.9l1.4-5.2H4.1" strokeLinejoin="round" />
      <circle cx="6" cy="13" r="1.1" />
      <circle cx="11.4" cy="13" r="1.1" />
    </svg>
  );
}

export function CartCount() {
  const [count, setCount] = useState(0);
  const pathname = usePathname();

  const refresh = useCallback(async (signal?: AbortSignal) => {
    try {
      const response = await fetch("/api/cart/summary", {
        cache: "no-store",
        signal,
      });
      if (!response.ok) {
        return;
      }

      const body = (await response.json()) as CartSummaryResponse;
      if (
        typeof body.count === "number" &&
        Number.isFinite(body.count) &&
        body.count >= 0
      ) {
        setCount(body.count);
      }
    } catch (error: unknown) {
      if (!(error instanceof DOMException && error.name === "AbortError")) {
        console.error("Could not read the cart count", error);
      }
    }
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    void refresh(controller.signal);
    return () => controller.abort();
  }, [pathname, refresh]);

  useEffect(() => {
    const handleCartUpdate = () => {
      void refresh();
    };

    window.addEventListener("kestrel:cart-updated", handleCartUpdate);
    return () =>
      window.removeEventListener("kestrel:cart-updated", handleCartUpdate);
  }, [refresh]);

  return (
    <Link
      href="/cart"
      aria-label={`Cart, ${count} ${count === 1 ? "item" : "items"}`}
      className="inline-flex h-11 shrink-0 items-center gap-2 text-[11px] font-semibold uppercase leading-none tracking-[0.14em] text-ink transition-colors hover:text-accent"
    >
      <CartIcon />
      Cart
      <span className="tabular-nums">({count})</span>
    </Link>
  );
}
