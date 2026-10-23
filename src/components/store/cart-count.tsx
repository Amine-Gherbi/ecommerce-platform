"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useCallback, useEffect, useState } from "react";

interface CartSummaryResponse {
  count?: unknown;
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
      className="inline-flex h-9 items-center gap-2 border border-rule px-3 text-[13px] text-ink transition-colors hover:border-ink"
    >
      Cart
      <span className="min-w-4 text-center text-[12px] tabular-nums text-ink/55">
        {count}
      </span>
    </Link>
  );
}
