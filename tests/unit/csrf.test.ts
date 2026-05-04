import { describe, expect, it } from "vitest";

import { CsrfError, assertSameOrigin, isSameOrigin } from "@/lib/csrf";

function request(headers: Record<string, string>): Request {
  return new Request("http://localhost:3000/api/login", {
    method: "POST",
    headers,
  });
}

describe("isSameOrigin", () => {
  it("accepts a matching Origin", () => {
    expect(
      isSameOrigin(
        request({ host: "localhost:3000", origin: "http://localhost:3000" }),
      ),
    ).toBe(true);
  });

  it("rejects a cross-site Origin", () => {
    expect(
      isSameOrigin(
        request({ host: "localhost:3000", origin: "https://evil.example" }),
      ),
    ).toBe(false);
  });

  it("falls back to Referer when Origin is absent", () => {
    expect(
      isSameOrigin(
        request({
          host: "localhost:3000",
          referer: "http://localhost:3000/login",
        }),
      ),
    ).toBe(true);
    expect(
      isSameOrigin(
        request({
          host: "localhost:3000",
          referer: "https://evil.example/login",
        }),
      ),
    ).toBe(false);
  });

  it("allows non-browser clients with no Origin or Referer", () => {
    expect(isSameOrigin(request({ host: "localhost:3000" }))).toBe(true);
  });

  it("honours x-forwarded-host", () => {
    expect(
      isSameOrigin(
        request({
          host: "internal:3000",
          "x-forwarded-host": "shop.example",
          origin: "https://shop.example",
        }),
      ),
    ).toBe(true);
  });

  it("rejects malformed origins and missing hosts", () => {
    expect(
      isSameOrigin(request({ host: "localhost:3000", origin: "not a url" })),
    ).toBe(false);
    expect(isSameOrigin(request({ origin: "http://localhost:3000" }))).toBe(
      false,
    );
  });
});

describe("assertSameOrigin", () => {
  it("throws CsrfError for a cross-site request", () => {
    expect(() =>
      assertSameOrigin(
        request({ host: "localhost:3000", origin: "https://evil.example" }),
      ),
    ).toThrow(CsrfError);
  });

  it("returns quietly for a same-origin request", () => {
    expect(() =>
      assertSameOrigin(
        request({ host: "localhost:3000", origin: "http://localhost:3000" }),
      ),
    ).not.toThrow();
  });
});
