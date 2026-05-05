"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import { addItemToCart } from "@/app/cart/actions";
import {
  fieldClass,
  labelClass,
  primaryButtonClass,
  textLinkClass,
} from "@/lib/styles";
import { cn } from "@/lib/utils";

type ResultMessage =
  | { kind: "success"; text: string }
  | { kind: "error"; text: string };

export function AddToCart({
  variantId,
  maxQuantity,
  soldOut,
}: {
  variantId: string;
  maxQuantity: number;
  soldOut: boolean;
}) {
  const router = useRouter();
  const [quantity, setQuantity] = useState(1);
  const [message, setMessage] = useState<ResultMessage | null>(null);
  const [isPending, startTransition] = useTransition();

  const quantities = Array.from(
    { length: Math.max(1, maxQuantity) },
    (_, index) => index + 1,
  );

  function handleAdd() {
    startTransition(async () => {
      const result = await addItemToCart(variantId, quantity);
      if (result.ok) {
        setMessage({ kind: "success", text: "Added to cart." });
        window.dispatchEvent(new Event("kestrel:cart-updated"));
        router.refresh();
      } else {
        setMessage({ kind: "error", text: result.message });
      }
    });
  }

  return (
    <div className="flex flex-col gap-3">
      {!soldOut ? (
        <label className="flex items-center gap-3">
          <span className={labelClass}>Quantity</span>
          <select
            value={quantity}
            onChange={(event) => setQuantity(Number(event.target.value))}
            className={cn(fieldClass, "h-10 w-20")}
          >
            {quantities.map((value) => (
              <option key={value} value={value}>
                {value}
              </option>
            ))}
          </select>
        </label>
      ) : null}

      <button
        type="button"
        onClick={handleAdd}
        disabled={soldOut || isPending}
        className={cn(primaryButtonClass, "w-full")}
      >
        {soldOut ? "Sold out" : isPending ? "Adding…" : "Add to cart"}
      </button>

      <div aria-live="polite" className="min-h-5">
        {message !== null ? (
          <p
            className={cn(
              "text-[13px] leading-5",
              "text-ink/70",
            )}
          >
            {message.text}
            {message.kind === "success" ? (
              <>
                {" "}
                <Link href="/cart" className={textLinkClass}>
                  View cart
                </Link>
              </>
            ) : null}
          </p>
        ) : null}
      </div>
    </div>
  );
}
