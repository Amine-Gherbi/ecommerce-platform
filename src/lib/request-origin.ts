import { NextRequest } from "next/server";

// A standalone Next server builds request URLs from the address it binds to
// (`0.0.0.0:<port>`), not from the proxy's public host. Auth.js reads
// `request.url` to build the provider callback URLs it reports from
// `/api/auth/providers` and the credentials callback, so those endpoints would
// otherwise advertise the container's internal bind address. The forwarded
// headers carry the origin the browser actually used; this module applies it
// to the request before Auth.js sees it.

const BIND_ADDRESSES = new Set(["0.0.0.0", "[::]", "::", "0:0:0:0:0:0:0:0"]);

type Environment = Readonly<Record<string, string | undefined>>;

function hostname(hostPort: string): string {
  if (hostPort.startsWith("[")) {
    const end = hostPort.indexOf("]");
    return end === -1 ? hostPort : hostPort.slice(0, end + 1);
  }
  if (hostPort.startsWith("::")) {
    return "::";
  }
  const colon = hostPort.indexOf(":");
  return colon === -1 ? hostPort : hostPort.slice(0, colon);
}

function firstValue(value: string | null): string | undefined {
  const first = value?.split(",")[0]?.trim();
  return first === undefined || first.length === 0 ? undefined : first;
}

function usableHost(host: string | undefined): string | undefined {
  return host !== undefined && !BIND_ADDRESSES.has(hostname(host))
    ? host
    : undefined;
}

function configuredOrigin(env: Environment): string | undefined {
  const configured =
    env.AUTH_URL ?? env.NEXTAUTH_URL ?? env.RENDER_EXTERNAL_URL ?? "";
  if (configured.length === 0) {
    return undefined;
  }
  try {
    return new URL(configured).origin;
  } catch {
    return undefined;
  }
}

/** The public origin of a request, preferring the proxy's forwarded headers. */
export function publicOrigin(
  request: Request,
  env: Environment = process.env,
): string {
  const current = new URL(request.url);
  const host =
    usableHost(firstValue(request.headers.get("x-forwarded-host"))) ??
    usableHost(firstValue(request.headers.get("host")));

  if (host === undefined) {
    return configuredOrigin(env) ?? current.origin;
  }

  const forwardedProtocol = firstValue(
    request.headers.get("x-forwarded-proto"),
  );
  const protocol =
    forwardedProtocol === "http" || forwardedProtocol === "https"
      ? forwardedProtocol
      : current.protocol === "http:"
        ? "http"
        : "https";

  return `${protocol}://${host}`;
}

/** A copy of `request` whose URL uses the public origin. */
export function withPublicOrigin(
  request: NextRequest,
  env: Environment = process.env,
): NextRequest {
  const origin = publicOrigin(request, env);
  const current = new URL(request.url);
  if (current.origin === origin) {
    return request;
  }

  const url = new URL(`${current.pathname}${current.search}`, origin);
  const init = {
    method: request.method,
    headers: request.headers,
    body:
      request.method === "GET" || request.method === "HEAD"
        ? null
        : request.body,
    // undici requires `duplex` when a Request body is a stream.
    duplex: "half",
  } as ConstructorParameters<typeof NextRequest>[1];

  return new NextRequest(url, init);
}
