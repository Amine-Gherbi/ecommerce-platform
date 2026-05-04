import { auth } from "@/auth";
import { getCurrentCart } from "@/lib/cart";
import {
  CheckoutError,
  parseCheckoutBody,
  performCheckout,
  type CheckoutRequestBody,
} from "@/lib/checkout";
import { isSameOrigin } from "@/lib/csrf";
import { clientIp, consumeRateLimit } from "@/lib/rate-limit";

// POST /api/checkout — the only place an order is created.
//
// The body is exactly `{addressId, cartVersion}`. A price, a quantity or a
// total in the body is not read: `parseCheckoutBody` returns two fields and
// the total is recomputed from `Variant.priceCents` inside the transaction.
//
// Rate limiting happens before the body is parsed, on a per-IP key; the
// per-account key is consumed once the session is known. Both windows are
// 5 attempts per minute.

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const NO_STORE = "no-store";

function json(body: unknown, status: number, headers?: HeadersInit): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": NO_STORE,
      ...headers,
    },
  });
}

function tooMany(retryAfterSeconds: number): Response {
  return json(
    { error: "RATE_LIMITED", message: "Too many checkout attempts" },
    429,
    { "retry-after": String(Math.max(1, retryAfterSeconds)) },
  );
}

function checkoutError(error: CheckoutError): Response {
  return json({ error: error.code, message: error.message }, error.status);
}

export async function POST(request: Request): Promise<Response> {
  if (!isSameOrigin(request)) {
    return json(
      { error: "CROSS_ORIGIN", message: "Cross-site request rejected" },
      403,
    );
  }

  const ipLimit = consumeRateLimit([
    `checkout:ip:${clientIp(request.headers)}`,
  ]);
  if (!ipLimit.allowed) {
    return tooMany(ipLimit.retryAfterSeconds);
  }

  const session = await auth();
  const userId = session?.user?.id ?? null;
  if (userId === null) {
    return json(
      { error: "UNAUTHENTICATED", message: "Sign in to check out" },
      401,
    );
  }

  const accountLimit = consumeRateLimit([`checkout:acct:${userId}`]);
  if (!accountLimit.allowed) {
    return tooMany(accountLimit.retryAfterSeconds);
  }

  let raw: unknown;
  try {
    raw = await request.json();
  } catch {
    return json(
      { error: "INVALID_BODY", message: "Expected a JSON body" },
      400,
    );
  }

  let body: CheckoutRequestBody;
  try {
    body = parseCheckoutBody(raw);
  } catch (error: unknown) {
    if (error instanceof CheckoutError) {
      return checkoutError(error);
    }
    throw error;
  }

  try {
    const cart = await getCurrentCart(userId);
    if (cart.id === null) {
      throw new CheckoutError(
        "CART_NOT_FOUND",
        409,
        "No active cart for this account",
      );
    }

    const result = await performCheckout({
      userId,
      cartId: cart.id,
      addressId: body.addressId,
      cartVersion: body.cartVersion,
    });

    return json(
      {
        orderId: result.order.id,
        status: result.order.status,
        subtotalCents: result.order.subtotalCents,
        discountCents: result.order.discountCents,
        totalCents: result.order.totalCents,
        currency: result.order.currency,
        created: result.created,
        paymentIntent: result.paymentIntent,
      },
      result.created ? 201 : 200,
    );
  } catch (error: unknown) {
    if (error instanceof CheckoutError) {
      return checkoutError(error);
    }
    console.error("[checkout] failed", error);
    return json(
      { error: "CHECKOUT_FAILED", message: "Checkout could not be completed" },
      500,
    );
  }
}
