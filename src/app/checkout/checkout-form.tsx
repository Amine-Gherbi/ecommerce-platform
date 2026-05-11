"use client";

import {
  Elements,
  PaymentElement,
  useElements,
  useStripe,
} from "@stripe/react-stripe-js";
import { loadStripe } from "@stripe/stripe-js";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition, type FormEvent } from "react";

import { formatPrice } from "@/lib/money";
import { primaryButtonClass, textLinkClass } from "@/lib/styles";
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

interface CheckoutLine {
  id: string;
  nameSnapshot: string;
  unitPriceCents: number;
  quantity: number;
}

interface PaymentStep {
  number: string;
  clientSecret: string;
  subtotalCents: number;
  shippingCents: number;
  totalCents: number;
  items: CheckoutLine[];
}

interface CheckoutResponse {
  number?: unknown;
  clientSecret?: unknown;
  subtotalCents?: unknown;
  shippingCents?: unknown;
  totalCents?: unknown;
  order?: { items?: unknown };
  error?: unknown;
  message?: unknown;
}

const publishableKey = process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY;
const stripePromise = publishableKey ? loadStripe(publishableKey) : null;

function isPaymentStep(body: CheckoutResponse): body is CheckoutResponse & {
  number: string;
  clientSecret: string;
  subtotalCents: number;
  shippingCents: number;
  totalCents: number;
  order: { items: CheckoutLine[] };
} {
  return (
    typeof body.number === "string" &&
    typeof body.clientSecret === "string" &&
    typeof body.subtotalCents === "number" &&
    typeof body.shippingCents === "number" &&
    typeof body.totalCents === "number" &&
    typeof body.order === "object" &&
    body.order !== null &&
    Array.isArray((body.order as { items?: unknown }).items)
  );
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
  const [payment, setPayment] = useState<PaymentStep | null>(null);
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

        if (response.status === 401) {
          router.push("/signin?next=/checkout");
          return;
        }

        if (
          (response.status === 201 || response.status === 200) &&
          typeof body.number === "string"
        ) {
          if (isPaymentStep(body)) {
            setPayment({
              number: body.number,
              clientSecret: body.clientSecret,
              subtotalCents: body.subtotalCents,
              shippingCents: body.shippingCents,
              totalCents: body.totalCents,
              items: body.order.items,
            });
            return;
          }

          // A replay of a checkout that already succeeded has no new client
          // secret: the order exists, so follow it.
          router.push(`/orders/${encodeURIComponent(body.number)}`);
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

  if (payment !== null) {
    return <PaymentForm payment={payment} />;
  }

  return (
    <form onSubmit={submit} className="flex flex-col gap-8">
      <fieldset className="border-t border-rule pt-6">
        <legend className="sr-only">Delivery address</legend>
        <div className="flex items-baseline justify-between gap-4">
          <h2 className="text-[22px] font-medium leading-7 tracking-[-0.01em]">
            Delivery address
          </h2>
          <a
            href="/account/addresses"
            className="text-[13px] text-muted underline decoration-rule underline-offset-4 hover:decoration-ink"
          >
            Manage addresses
          </a>
        </div>

        {addresses.length === 0 ? (
          <p className="mt-4 border-l-2 border-sale pl-3 text-[13px] leading-5 text-muted">
            Add an address above, then place the order.
          </p>
        ) : (
          <ul className="mt-4 flex flex-col gap-3">
            {addresses.map((address) => (
              <li key={address.id}>
                <label
                  className={cn(
                    "flex cursor-pointer items-start gap-3 border border-control p-4 transition-colors",
                    addressId === address.id ? "border-accent" : "hover:border-muted",
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
                  <span className="text-[13px] leading-5 text-muted">
                    <span className="block text-[11px] uppercase tracking-[0.14em] text-muted">
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
          <p className="text-[11px] uppercase leading-4 tracking-[0.14em] text-muted">
            Payment
          </p>
          <p className="mt-2 text-[15px] leading-5 text-ink">
            Stripe sandbox payment
          </p>
          <p className="mt-1 text-[13px] leading-5 text-muted">
            After the order is created you will enter a card. Use{" "}
            <span className="whitespace-nowrap text-ink">4242 4242 4242 4242</span>{" "}
            with any future expiry and any CVC; this is a test-mode payment and no
            real money moves.
          </p>
        </div>

        <input type="hidden" name="cartVersion" value={cartVersion} />

        <div aria-live="polite" className="mt-4">
          {error !== null ? (
            <p
              role="alert"
              className="border-l-2 border-sale pl-3 text-[13px] leading-5 text-sale"
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

function PaymentForm({ payment }: { payment: PaymentStep }) {
  return (
    <div className="flex flex-col gap-8">
      <div className="border-t border-rule pt-6">
        <h2 className="text-[22px] font-medium leading-7 tracking-[-0.01em]">
          Pay for {payment.number}
        </h2>
        <p className="mt-2 text-[13px] leading-5 text-muted">
          The order exists. Stripe collects the card in test mode; the webhook
          moves the order to paid once the amount matches.
        </p>

        <ul className="mt-5 border-t border-rule">
          {payment.items.map((item) => (
            <li
              key={item.id}
              className="flex items-start justify-between gap-4 border-b border-rule py-3"
            >
              <span className="text-[13px] leading-5 text-ink">
                {item.nameSnapshot} · Qty {item.quantity}
              </span>
              <span className="shrink-0 text-[13px] tabular-nums text-muted">
                {formatPrice(item.unitPriceCents * item.quantity)}
              </span>
            </li>
          ))}
        </ul>

        <dl className="mt-4 flex flex-col gap-2 text-[13px] leading-5">
          <div className="flex items-baseline justify-between gap-4">
            <dt className="text-muted">Subtotal</dt>
            <dd className="tabular-nums text-ink">
              {formatPrice(payment.subtotalCents)}
            </dd>
          </div>
          <div className="flex items-baseline justify-between gap-4">
            <dt className="text-muted">Shipping</dt>
            <dd className="tabular-nums text-ink">
              {payment.shippingCents === 0
                ? "Free"
                : formatPrice(payment.shippingCents)}
            </dd>
          </div>
          <div className="flex items-baseline justify-between gap-4 border-t border-rule pt-2">
            <dt className="text-ink">Total</dt>
            <dd className="text-[17px] tabular-nums text-ink">
              {formatPrice(payment.totalCents)}
            </dd>
          </div>
        </dl>

        <p className="mt-4 text-[13px] leading-5 text-muted">
          Sandbox card{" "}
          <span className="whitespace-nowrap text-ink">4242 4242 4242 4242</span>,
          any future expiry and any CVC. No real money moves.
        </p>
      </div>

      {stripePromise === null ? (
        <div className="border border-rule bg-surface p-4">
          <p className="text-[13px] leading-5 text-muted">
            Stripe is not configured in this environment, so the card form cannot
            be shown. The order exists and can be paid once the publishable key
            is set.
          </p>
          <Link
            href={`/orders/${encodeURIComponent(payment.number)}`}
            className={cn("mt-3 inline-block text-[13px] text-ink", textLinkClass)}
          >
            View the order
          </Link>
        </div>
      ) : (
        <Elements
          stripe={stripePromise}
          options={{
            clientSecret: payment.clientSecret,
            appearance: {
              variables: { colorPrimary: "#0e5f52", borderRadius: "0px" },
            },
          }}
        >
          <PaymentConfirm
            number={payment.number}
            totalCents={payment.totalCents}
          />
        </Elements>
      )}
    </div>
  );
}

function PaymentConfirm({
  number,
  totalCents,
}: {
  number: string;
  totalCents: number;
}) {
  const stripe = useStripe();
  const elements = useElements();
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function pay(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();

    if (stripe === null || elements === null) {
      return;
    }

    setError(null);
    setPending(true);

    const result = await stripe.confirmPayment({
      elements,
      confirmParams: {
        return_url: `${window.location.origin}/orders/${encodeURIComponent(number)}`,
      },
    });

    if (result.error !== undefined) {
      setError(result.error.message ?? "The payment could not be completed.");
      setPending(false);
    }
  }

  return (
    <form onSubmit={pay} className="flex flex-col gap-4">
      <PaymentElement />

      <div aria-live="polite">
        {error !== null ? (
          <p
            role="alert"
            className="border-l-2 border-sale pl-3 text-[13px] leading-5 text-sale"
          >
            {error}
          </p>
        ) : null}
      </div>

      <button
        type="submit"
        disabled={pending || stripe === null || elements === null}
        className={cn(primaryButtonClass, "w-full")}
      >
        {pending ? "Confirming payment…" : `Pay ${formatPrice(totalCents)}`}
      </button>
    </form>
  );
}
