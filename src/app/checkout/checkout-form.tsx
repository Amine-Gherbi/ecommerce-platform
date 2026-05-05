"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition, type FormEvent } from "react";

import { primaryButtonClass } from "@/lib/styles";
import { cn } from "@/lib/utils";

export interface CheckoutAddress {
  id: string;
  label: string;
  line1: string;
  line2: string | null;
  city: string;
  postalCode: string;
  country: string;
}

interface CheckoutResponse {
  number?: unknown;
  error?: unknown;
  message?: unknown;
}

export function CheckoutForm({
  addresses,
  cartVersion,
}: {
  addresses: CheckoutAddress[];
  cartVersion: string;
}) {
  const router = useRouter();
  const [addressId, setAddressId] = useState(addresses[0]?.id ?? "");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function submit(event: FormEvent<HTMLFormElement>): void {
    event.preventDefault();
    setError(null);

    if (addressId.length === 0) {
      setError("Choose a delivery address.");
      return;
    }

    startTransition(async () => {
      try {
        // Exactly two fields. Nothing on this page can set a price.
        const response = await fetch("/api/checkout", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ addressId, cartVersion }),
        });
        const body = (await response.json()) as CheckoutResponse;

        if (
          (response.status === 201 || response.status === 200) &&
          typeof body.number === "string"
        ) {
          router.push(`/orders/${encodeURIComponent(body.number)}`);
          return;
        }

        if (response.status === 401) {
          router.push("/signin?next=/checkout");
          return;
        }

        if (body.error === "CART_CHANGED" || body.error === "OUT_OF_STOCK") {
          setError(
            typeof body.message === "string"
              ? body.message
              : "Your cart changed. Review it and try again.",
          );
          router.refresh();
          return;
        }

        setError(
          typeof body.message === "string" && body.message.length > 0
            ? body.message
            : "The order could not be placed. Try again.",
        );
      } catch {
        setError("The order could not be placed. Check your connection and try again.");
      }
    });
  }

  return (
    <form onSubmit={submit} className="flex flex-col gap-8">
      <fieldset className="border-t border-rule pt-6">
        <legend className="sr-only">Delivery address</legend>
        <div className="flex items-baseline justify-between gap-4">
          <h2 className="text-[20px] font-medium leading-7 tracking-[-0.01em]">
            Delivery address
          </h2>
          <a
            href="/account/addresses"
            className="text-[13px] text-ink/55 underline decoration-rule underline-offset-4 hover:decoration-ink"
          >
            Manage addresses
          </a>
        </div>

        {addresses.length === 0 ? (
          <p className="mt-4 border-l-2 border-accent pl-3 text-[13px] leading-5 text-ink/65">
            Add an address above, then place the order.
          </p>
        ) : (
          <ul className="mt-4 flex flex-col gap-3">
            {addresses.map((address) => (
              <li key={address.id}>
                <label
                  className={cn(
                    "flex cursor-pointer items-start gap-3 border border-rule p-4 transition-colors",
                    addressId === address.id ? "border-ink" : "hover:border-ink/40",
                  )}
                >
                  <input
                    type="radio"
                    name="addressId"
                    value={address.id}
                    checked={addressId === address.id}
                    onChange={() => setAddressId(address.id)}
                    className="mt-1"
                    required
                  />
                  <span className="text-[13px] leading-5 text-ink/70">
                    <span className="block text-[11px] uppercase tracking-[0.14em] text-ink/45">
                      {address.label}
                    </span>
                    <span className="mt-1 block">{address.line1}</span>
                    {address.line2 !== null ? (
                      <span className="block">{address.line2}</span>
                    ) : null}
                    <span className="block">
                      {address.city}, {address.postalCode}
                    </span>
                    <span className="block">{address.country}</span>
                  </span>
                </label>
              </li>
            ))}
          </ul>
        )}
      </fieldset>

      <div className="border-t border-rule pt-6">
        <div className="border border-rule bg-surface p-4">
          <p className="text-[11px] uppercase leading-4 tracking-[0.14em] text-ink/55">
            Payment
          </p>
          <p className="mt-2 text-[14px] leading-5 text-ink">
            Simulated payment (demo)
          </p>
          <p className="mt-1 text-[13px] leading-5 text-ink/55">
            No card is collected and no money moves. The order stays pending
            until a signed demo webhook confirms it.
          </p>
        </div>

        <input type="hidden" name="cartVersion" value={cartVersion} />

        <div aria-live="polite" className="mt-4">
          {error !== null ? (
            <p
              role="alert"
              className="border-l-2 border-accent pl-3 text-[13px] leading-5 text-accent"
            >
              {error}
            </p>
          ) : null}
        </div>

        <button
          type="submit"
          disabled={pending || addresses.length === 0}
          className={cn(primaryButtonClass, "mt-4 w-full")}
        >
          {pending ? "Placing order…" : "Place order"}
        </button>
      </div>
    </form>
  );
}
