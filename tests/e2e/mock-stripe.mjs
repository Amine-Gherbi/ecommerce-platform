// Minimal Stripe API stand-in for the browser suite. It answers the one call
// checkout makes — POST /v1/payment_intents — with a PaymentIntent-shaped JSON
// body, so the real `stripe` SDK path (request signing, form encoding, response
// parsing) runs without an external call. It is never used by the app in
// production; Playwright starts it and points STRIPE_API_HOST at it.
import { randomUUID } from "node:crypto";
import { createServer } from "node:http";

const port = Number(process.env.MOCK_STRIPE_PORT ?? "12111");

function json(response, status, body) {
  response.writeHead(status, { "content-type": "application/json" });
  response.end(JSON.stringify(body));
}

const server = createServer((request, response) => {
  if (request.method === "GET" && request.url === "/health") {
    json(response, 200, { ok: true });
    return;
  }

  if (
    request.method === "POST" &&
    request.url !== null &&
    request.url.startsWith("/v1/payment_intents")
  ) {
    let rawBody = "";
    request.on("data", (chunk) => {
      rawBody += chunk;
    });
    request.on("end", () => {
      const params = new URLSearchParams(rawBody);
      const metadata = {};
      for (const [key, value] of params.entries()) {
        const match = /^metadata\[(.+)\]$/.exec(key);
        if (match !== null) {
          metadata[match[1]] = value;
        }
      }

      const id = `pi_mock_${randomUUID().replaceAll("-", "")}`;
      json(response, 200, {
        id,
        object: "payment_intent",
        amount: Number(params.get("amount") ?? "0"),
        currency: params.get("currency") ?? "eur",
        metadata,
        status: "requires_payment_method",
        client_secret: `${id}_secret_mock`,
        automatic_payment_methods: { enabled: true },
      });
    });
    return;
  }

  json(response, 404, { error: "not found" });
});

server.listen(port, "127.0.0.1", () => {
  console.log(`[mock-stripe] listening on 127.0.0.1:${port}`);
});
