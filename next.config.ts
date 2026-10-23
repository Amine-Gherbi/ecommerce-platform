import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Screenshots for the hub are taken against the dev server; the floating
  // Next.js badge is browser chrome, not part of the storefront.
  devIndicators: false,
};

export default nextConfig;
