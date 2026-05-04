"use client";

import { useState } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

// The only client component on the checkout page. It sends the two fields the
// route accepts — `addressId` and the cart version it was shown — and renders
// whatever money the server returns. A price or total in this component would
// be display-only; the request body cannot carry one.

interface CheckoutResponse {
  orderId?: string;
  status?: string;
  totalCents?: number;
  created?: boolean;
  error?: string;
  message?: string;
}

export function CheckoutForm({
  cartVersion,
  totalCents,
}: {
  cartVersion: string;
  totalCents: number;
}) {
  const [addressId, setAddressId] = useState("addr_demo_001");
  const [pending, setPending] = useState(false);
  const [result, setResult] = useState<CheckoutResponse | null>(null);

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPending(true);
    setResult(null);

    try {
      const response = await fetch("/api/checkout", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ addressId, cartVersion }),
      });
      const body = (await response.json()) as CheckoutResponse;
      setResult(body);
    } catch {
      setResult({ error: "NETWORK", message: "Checkout request failed" });
    } finally {
      setPending(false);
    }
  }

  return (
    <form onSubmit={submit} className="mt-6 grid gap-4" data-testid="checkout-form">
      <div className="grid gap-1.5">
        <Label htmlFor="addressId">Delivery address</Label>
        <Input
          id="addressId"
          name="addressId"
          value={addressId}
          onChange={(event) => setAddressId(event.target.value)}
          required
          maxLength={128}
          data-testid="checkout-address"
        />
        <p className="text-xs text-muted-foreground">
          The body carries this id and the cart version only. Prices come from
          the database inside the checkout transaction.
        </p>
      </div>

      <div className="flex flex-wrap items-center gap-4">
        <Button type="submit" disabled={pending} data-testid="checkout-submit">
          {pending ? "Placing order…" : `Place order · ${(totalCents / 100).toFixed(2)} USD`}
        </Button>
        <span className="font-mono text-xs text-muted-foreground">
          cart version {cartVersion.slice(0, 12)}…
        </span>
      </div>

      {result !== null && (
        <div
          role="status"
          data-testid="checkout-result"
          className="rounded-lg border bg-muted/40 px-4 py-3 text-sm"
        >
          {result.orderId !== undefined ? (
            <p>
              Order <code className="font-mono">{result.orderId}</code> —{" "}
              <strong>{result.status}</strong> — server total{" "}
              <strong className="tabular-nums">
                {(result.totalCents ?? 0) / 100} USD
              </strong>
              {result.created === false ? " (existing order returned)" : ""}
            </p>
          ) : (
            <p>
              <strong>{result.error ?? "CHECKOUT_FAILED"}</strong>
              {result.message !== undefined ? `: ${result.message}` : ""}
            </p>
          )}
        </div>
      )}
    </form>
  );
}
