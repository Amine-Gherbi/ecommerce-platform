import { NextRequest } from "next/server";
import { describe, expect, it } from "vitest";

import { publicOrigin, withPublicOrigin } from "@/lib/request-origin";

function plainRequest(
  url: string,
  headers: Record<string, string> = {},
): Request {
  return new Request(url, { headers });
}

function nextRequest(
  url: string,
  headers: Record<string, string> = {},
): NextRequest {
  return new NextRequest(url, { headers });
}

describe("publicOrigin", () => {
  it("uses the proxy's forwarded host and protocol, not the bind address", () => {
    const origin = publicOrigin(
      plainRequest("https://0.0.0.0:10000/api/auth/providers", {
        "x-forwarded-host": "kestrel-store.onrender.com",
        "x-forwarded-proto": "https",
      }),
      {},
    );

    expect(origin).toBe("https://kestrel-store.onrender.com");
  });

  it("falls back to Host when forwarded host is the bind address", () => {
    const origin = publicOrigin(
      plainRequest("https://0.0.0.0:10000/api/auth/providers", {
        host: "kestrel-store.onrender.com",
        "x-forwarded-host": "0.0.0.0:10000",
        "x-forwarded-proto": "https",
      }),
      {},
    );

    expect(origin).toBe("https://kestrel-store.onrender.com");
  });

  it("keeps the local http origin for development", () => {
    const origin = publicOrigin(
      plainRequest("http://0.0.0.0:3100/api/auth/providers", {
        host: "127.0.0.1:3100",
        "x-forwarded-proto": "http",
      }),
      {},
    );

    expect(origin).toBe("http://127.0.0.1:3100");
  });

  it("uses a configured public URL when every header carries a bind address", () => {
    const origin = publicOrigin(
      plainRequest("https://0.0.0.0:10000/api/auth/providers", {
        host: "0.0.0.0:10000",
        "x-forwarded-proto": "https",
      }),
      { RENDER_EXTERNAL_URL: "https://kestrel-store.onrender.com" },
    );

    expect(origin).toBe("https://kestrel-store.onrender.com");
  });

  it("ignores a malformed configured URL", () => {
    const origin = publicOrigin(
      plainRequest("http://127.0.0.1:3000/api/auth/providers", { host: "::" }),
      { AUTH_URL: "not a url" },
    );

    expect(origin).toBe("http://127.0.0.1:3000");
  });
});

describe("withPublicOrigin", () => {
  it("rewrites the request URL to the public origin", () => {
    const corrected = withPublicOrigin(
      nextRequest("https://0.0.0.0:10000/api/auth/providers?x=1", {
        "x-forwarded-host": "kestrel-store.onrender.com",
        "x-forwarded-proto": "https",
      }),
      {},
    );

    expect(corrected.url).toBe(
      "https://kestrel-store.onrender.com/api/auth/providers?x=1",
    );
  });

  it("returns the same request when the origin already matches", () => {
    const original = nextRequest("http://localhost:3100/api/auth/providers", {
      host: "localhost:3100",
      "x-forwarded-proto": "http",
    });

    expect(withPublicOrigin(original, {})).toBe(original);
  });

  it("preserves the method and body of a POST", async () => {
    const corrected = withPublicOrigin(
      new NextRequest("https://0.0.0.0:10000/api/auth/callback/credentials", {
        method: "POST",
        headers: {
          "content-type": "application/x-www-form-urlencoded",
          "x-forwarded-host": "kestrel-store.onrender.com",
          "x-forwarded-proto": "https",
        },
        body: "email=demo%40kestrel.test",
      }),
      {},
    );

    expect(corrected.method).toBe("POST");
    expect(corrected.url).toBe(
      "https://kestrel-store.onrender.com/api/auth/callback/credentials",
    );
    await expect(corrected.text()).resolves.toBe("email=demo%40kestrel.test");
  });
});
