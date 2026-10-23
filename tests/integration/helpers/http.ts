import type { OrderStatus } from "@prisma/client";

// Request/response helpers for the route handlers. The Host header is set
// explicitly because `isSameOrigin` needs one; with no Origin/Referer header
// the request is treated as a non-browser client, which is what a test is.

export interface CheckoutHttpBody {
  orderId?: string;
  status?: OrderStatus;
  subtotalCents?: number;
  discountCents?: number;
  totalCents?: number;
  currency?: string;
  created?: boolean;
  paymentIntent?: {
    id: string;
    clientSecret: string | null;
    amountCents: number;
    live: boolean;
  };
  error?: string;
  message?: string;
}

export function checkoutRequest(
  body: unknown,
  clientAddress: string,
  extraHeaders: Record<string, string> = {},
): Request {
  return new Request("http://localhost/api/checkout", {
    method: "POST",
    headers: {
      host: "localhost",
      "content-type": "application/json",
      "x-forwarded-for": clientAddress,
      ...extraHeaders,
    },
    body: JSON.stringify(body),
  });
}

export async function readCheckout(
  response: Response,
): Promise<{ status: number; body: CheckoutHttpBody }> {
  return {
    status: response.status,
    body: (await response.json()) as CheckoutHttpBody,
  };
}

export interface WebhookHttpBody {
  received?: boolean;
  action?: "processed" | "ignored" | "illegal" | "duplicate";
  error?: string;
  message?: string;
}

export async function readWebhook(
  response: Response,
): Promise<{ status: number; body: WebhookHttpBody }> {
  return {
    status: response.status,
    body: (await response.json()) as WebhookHttpBody,
  };
}
