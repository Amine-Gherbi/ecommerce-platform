import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // The container runs `.next/standalone/server.js`; Dockerfile copies
  // `public/` and `.next/static` beside it.
  output: "standalone",
  // Screenshots for the hub are taken against the dev server; the floating
  // Next.js badge is browser chrome, not part of the storefront.
  devIndicators: false,
};

export default nextConfig;
