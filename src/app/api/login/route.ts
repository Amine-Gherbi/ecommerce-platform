import { CredentialsSignin } from "next-auth";

import { RateLimitedSignin, signIn } from "@/auth";
import { isSameOrigin } from "@/lib/csrf";
import {
  RATE_LIMIT_WINDOW_MS,
  clientIp,
  isRateLimited,
  loginRateLimitKeys,
} from "@/lib/rate-limit";

// POST /login is rewritten here by `src/middleware.ts`. This handler owns the
// HTTP status semantics the DoD asks for: 429 when the per-IP or per-account
// window is exhausted, 401-ish redirect for bad credentials, 303 on success.

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const NO_STORE = "no-store";

function plain(body: string, status: number, extra?: HeadersInit): Response {
  return new Response(body, {
    status,
    headers: {
      "content-type": "text/plain; charset=utf-8",
      "cache-control": NO_STORE,
      ...extra,
    },
  });
}

function tooMany(): Response {
  return plain(
    "Too many sign-in attempts. Try again in a minute.",
    429,
    { "retry-after": String(Math.ceil(RATE_LIMIT_WINDOW_MS / 1_000)) },
  );
}

function seeOther(location: string): Response {
  return new Response(null, {
    status: 303,
    headers: { location, "cache-control": NO_STORE },
  });
}

export async function POST(request: Request): Promise<Response> {
  if (!isSameOrigin(request)) {
    return plain("Cross-site request rejected", 403);
  }

  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return plain("Expected a form submission", 400);
  }

  const emailValue = form.get("email");
  const passwordValue = form.get("password");
  const email =
    typeof emailValue === "string" ? emailValue.trim().toLowerCase() : "";
  const password = typeof passwordValue === "string" ? passwordValue : "";

  if (email.length === 0 || password.length === 0) {
    return plain("Email and password are required", 400);
  }

  const keys = loginRateLimitKeys(clientIp(request.headers), email);
  if (isRateLimited(keys)) {
    return tooMany();
  }

  try {
    // `signIn` verifies the credentials through `authorize` (which consumes the
    // rate-limit window), runs the merge event in the same request, and writes
    // the session cookie through Next's mutable cookie store.
    const target = await signIn("credentials", {
      email,
      password,
      redirect: false,
      redirectTo: "/",
    });

    if (typeof target === "string" && target.includes("error=")) {
      // The 6th attempt is rejected inside `authorize`; the URL only carries
      // `error=CredentialsSignin`, so ask the limiter which case this was.
      if (isRateLimited(keys)) {
        return tooMany();
      }
      return seeOther("/login?error=CredentialsSignin");
    }

    return seeOther("/");
  } catch (error: unknown) {
    // `signIn` runs Auth.js in "raw" mode, so a rejected credentials attempt
    // surfaces as a thrown CredentialsSignin rather than a redirect URL.
    // `authorize` throws the RateLimitedSignin subclass only when the window was
    // already exhausted before this attempt, so the 5th allowed attempt is not
    // mislabelled by counting itself.
    if (error instanceof RateLimitedSignin) {
      return tooMany();
    }
    if (error instanceof CredentialsSignin) {
      return seeOther("/login?error=CredentialsSignin");
    }
    console.error("[auth] credentials sign-in failed", error);
    return plain("Sign-in failed", 500);
  }
}
