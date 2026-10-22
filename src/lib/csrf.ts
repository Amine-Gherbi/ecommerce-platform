// Origin check for state-changing Route Handlers.
//
// Server Actions get Next's built-in Origin/Host check. Route handlers do not,
// so `/api/login` calls this explicitly. A browser sends `Origin` on every
// cross-origin POST; if it is present it must match `Host`. If it is absent we
// fall back to `Referer`, and only allow neither (non-browser clients such as
// curl, which cannot be tricked into carrying a victim's cookies).
//
// `x-forwarded-host` is honoured because Next dev/proxy setups forward the
// public host while `host` may be the internal one.

export class CsrfError extends Error {
  constructor() {
    super("Cross-site request rejected");
    this.name = "CsrfError";
  }
}

function forwardedHost(headers: Headers): string | null {
  const forwarded = headers.get("x-forwarded-host")?.split(",")[0]?.trim();
  if (forwarded !== undefined && forwarded.length > 0) {
    return forwarded;
  }
  const host = headers.get("host")?.trim();
  return host !== undefined && host.length > 0 ? host : null;
}

function hostOf(value: string): string | null {
  try {
    return new URL(value).host;
  } catch {
    return null;
  }
}

/** True when the request is same-origin or carries no browser origin at all. */
export function isSameOrigin(request: Request): boolean {
  const host = forwardedHost(request.headers);
  if (host === null) {
    return false;
  }

  const origin = request.headers.get("origin");
  if (origin !== null) {
    return hostOf(origin) === host;
  }

  const referer = request.headers.get("referer");
  if (referer !== null) {
    return hostOf(referer) === host;
  }

  return true;
}

/** @throws CsrfError when the origin is present and does not match. */
export function assertSameOrigin(request: Request): void {
  if (!isSameOrigin(request)) {
    throw new CsrfError();
  }
}
