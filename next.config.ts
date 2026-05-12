import type { NextConfig } from "next";

// Content Security Policy. The app is server-rendered; Next emits its runtime
// as inline scripts, so `'unsafe-inline'` is required until a nonce pipeline is
// introduced. Stripe.js and the Payment Element need their documented origins:
// js.stripe.com for the script and frames, hooks.stripe.com for redirect
// frames, api.stripe.com for the PaymentIntent, and the Radar/fraud hosts.
const isDevelopment = process.env.NODE_ENV === "development";

const contentSecurityPolicy = [
  "default-src 'self'",
  "base-uri 'self'",
  "object-src 'none'",
  "frame-ancestors 'none'",
  "form-action 'self'",
  "manifest-src 'self'",
  [
    "script-src 'self' 'unsafe-inline' https://js.stripe.com",
    // The dev server evaluates modules for Fast Refresh and talks to its
    // websocket; production has neither.
    ...(isDevelopment ? ["'unsafe-eval'", "ws:"] : []),
  ].join(" "),
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob: https://*.stripe.com",
  "font-src 'self' data:",
  [
    "connect-src 'self' https://api.stripe.com https://m.stripe.network",
    "https://q.stripe.com https://r.stripe.com https://errors.stripe.com",
    ...(isDevelopment ? ["ws: wss:"] : []),
  ].join(" "),
  "frame-src https://js.stripe.com https://hooks.stripe.com https://m.stripe.network",
  "worker-src 'self' blob:",
].join("; ");

const securityHeaders = [
  {
    key: "Strict-Transport-Security",
    value: "max-age=31536000; includeSubDomains",
  },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  {
    key: "Permissions-Policy",
    value: "camera=(), microphone=(), geolocation=()",
  },
  { key: "Content-Security-Policy", value: contentSecurityPolicy },
];

const nextConfig: NextConfig = {
  // The container runs `.next/standalone/server.js`; Dockerfile copies
  // `public/` and `.next/static` beside it.
  output: "standalone",
  // Screenshots for the hub are taken against the dev server; the floating
  // Next.js badge is browser chrome, not part of the storefront.
  devIndicators: false,
  // Do not advertise the framework in every response.
  poweredByHeader: false,
  async headers() {
    return [
      {
        source: "/(.*)",
        headers: securityHeaders,
      },
    ];
  },
};

export default nextConfig;
