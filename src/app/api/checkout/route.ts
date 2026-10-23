import { auth } from "@/auth";
import { parseCheckoutBody, placeOrder } from "@/lib/checkout";
import type { CheckoutOrder } from "@/lib/checkout";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// The contract is `{addressId, cartVersion}`. Prices in the body are not
// rejected; they are simply not read. Every number in the response and on the
// order came from Variant.priceCents inside placeOrder's transaction.
function payload(order: CheckoutOrder): Record<string, unknown> {
  return {
    number: order.number,
    status: order.status,
    subtotalCents: order.subtotalCents,
    shippingCents: order.shippingCents,
    totalCents: order.totalCents,
    currency: order.currency,
    order,
  };
}

export async function POST(request: Request): Promise<Response> {
  const session = await auth();
  const userId = session?.user?.id;

  if (typeof userId !== "string" || userId.length === 0) {
    return Response.json({ error: "UNAUTHORIZED" }, { status: 401 });
  }

  let raw: unknown;
  try {
    raw = await request.json();
  } catch {
    return Response.json({ error: "INVALID_JSON" }, { status: 400 });
  }

  const body = parseCheckoutBody(raw);
  if (!body.ok) {
    return Response.json(
      { error: "INVALID_BODY", message: body.error },
      { status: 400 },
    );
  }

  const result = await placeOrder({
    userId,
    addressId: body.addressId,
    cartVersion: body.cartVersion,
  });

  switch (result.kind) {
    case "created":
      return Response.json(payload(result.order), { status: 201 });

    case "duplicate":
      // A replay is a success: the same body, so a client that lost the first
      // response can follow the existing order instead of retrying blindly.
      return Response.json(payload(result.order), { status: 200 });

    case "cart_changed":
      return Response.json(
        {
          error: "CART_CHANGED",
          message: "The cart changed. Review it and place the order again.",
        },
        { status: 409 },
      );

    case "no_cart":
      return Response.json(
        { error: "CART_EMPTY", message: "There is nothing to check out." },
        { status: 409 },
      );

    case "invalid_address":
      return Response.json(
        {
          error: "INVALID_ADDRESS",
          message: "Choose a delivery address on this account.",
        },
        { status: 400 },
      );

    case "out_of_stock":
      return Response.json(
        {
          error: "OUT_OF_STOCK",
          message: "One of the items sold out while you were checking out.",
        },
        { status: 409 },
      );
  }
}
