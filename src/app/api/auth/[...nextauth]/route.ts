import type { NextRequest } from "next/server";

import { handlers } from "@/auth";
import { withPublicOrigin } from "@/lib/request-origin";

// Prisma and argon2 require the Node.js runtime; Auth.js defaults to it, but
// stating it prevents an accidental Edge move from breaking credentials.
export const runtime = "nodejs";

// Auth.js builds the callback URLs it reports from `request.url`. A standalone
// Next server derives that URL from its bind address, so restore the public
// origin the proxy forwarded before handing the request over.
export function GET(request: NextRequest): Promise<Response> {
  return handlers.GET(withPublicOrigin(request));
}

export function POST(request: NextRequest): Promise<Response> {
  return handlers.POST(withPublicOrigin(request));
}
