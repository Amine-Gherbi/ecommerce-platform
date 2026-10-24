"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState, useTransition } from "react";

import {
  removeCartItem,
  setCartItemQuantity,
} from "@/app/cart/actions";
import { focusRing, textLinkClass } from "@/lib/styles";
import { cn } from "@/lib/utils";

export function CartLineControls({
  itemId,
  quantity,
  maxQuantity,
}: {
  itemId: string;
  quantity: number;
  maxQuantity: number;
}) {
  const router = useRouter();
  const [currentQuantity, setCurrentQuantity] = useState(quantity);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  useEffect(() => {
    setCurrentQuantity(quantity);
  }, [quantity]);

  function announceChange() {
    window.dispatchEvent(new Event("kestrel:cart-updated"));
    router.refresh();
  }

  function changeQuantity(nextQuantity: number) {
    if (nextQuantity < 1 || nextQuantity > maxQuantity) {
      return;
    }

    setError(null);
    setCurrentQuantity(nextQuantity);
    startTransition(async () => {
      const result = await setCartItemQuantity(itemId, nextQuantity);
      if (result.ok) {
        announceChange();
      } else {
        setCurrentQuantity(quantity);
        setError(result.message);
      }
    });
  }

  function remove() {
    setError(null);
    startTransition(async () => {
      const result = await removeCartItem(itemId);
      if (result.ok) {
        announceChange();
      } else {
        setError(result.message);
      }
    });
  }

  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap items-center gap-x-5 gap-y-3">
        <div
          className="flex h-11 items-center border border-control"
          aria-label="Quantity"
        >
          <button
            type="button"
            onClick={() => changeQuantity(currentQuantity - 1)}
            disabled={isPending || currentQuantity <= 1}
            aria-label="Decrease quantity"
            className={`flex size-11 items-center justify-center text-[15px] text-ink transition-colors hover:text-accent disabled:cursor-not-allowed disabled:opacity-35 ${focusRing}`}
          >
            −
          </button>
          <span
            aria-live="polite"
            className="w-8 text-center text-[13px] tabular-nums text-ink"
          >
            {currentQuantity}
          </span>
          <button
            type="button"
            onClick={() => changeQuantity(currentQuantity + 1)}
            disabled={isPending || currentQuantity >= maxQuantity}
            aria-label="Increase quantity"
            className={`flex size-11 items-center justify-center text-[15px] text-ink transition-colors hover:text-accent disabled:cursor-not-allowed disabled:opacity-35 ${focusRing}`}
          >
            +
          </button>
        </div>

        <button
          type="button"
          onClick={remove}
          disabled={isPending}
          className={cn(
            "inline-flex min-h-11 items-center text-[13px] uppercase tracking-[0.14em] text-muted disabled:opacity-40",
            textLinkClass,
          )}
        >
          Remove
        </button>
      </div>

      <div aria-live="polite" className="min-h-4">
        {error !== null ? (
          <p className="text-[13px] leading-5 text-sale">{error}</p>
        ) : null}
      </div>
    </div>
  );
}
