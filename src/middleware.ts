import { NextResponse, type NextRequest } from "next/server";

// The sign-in form posts to `/login` so the visible URL is the one that returns
// 429. App Router cannot host `page.tsx` and `route.ts` in the same segment, so
// POSTs are rewritten to the Node route handler at `/api/login`. GET `/login`
// falls through to the page.
//
// The matcher deliberately excludes `/api/webhooks`: Stripe must reach it
// untouched, and middleware runs before the body is read.
export function middleware(request: NextRequest): NextResponse {
  if (request.method === "POST" && request.nextUrl.pathname === "/login") {
    const url = request.nextUrl.clone();
    url.pathname = "/api/login";
    return NextResponse.rewrite(url);
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!api/webhooks|_next/static|_next/image|favicon.ico).*)"],
};
