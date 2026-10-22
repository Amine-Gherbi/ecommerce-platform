import { beforeEach, describe, expect, it } from "vitest";

import {
  RATE_LIMIT_MAX_ATTEMPTS,
  RATE_LIMIT_WINDOW_MS,
  clientIp,
  consumeRateLimit,
  isRateLimited,
  loginRateLimitKeys,
  resetRateLimit,
} from "@/lib/rate-limit";

describe("consumeRateLimit", () => {
  beforeEach(() => {
    resetRateLimit();
  });

  it("allows five attempts and rejects the sixth", () => {
    for (let attempt = 1; attempt <= RATE_LIMIT_MAX_ATTEMPTS; attempt += 1) {
      expect(consumeRateLimit(["ip:1.2.3.4"]).allowed).toBe(true);
    }

    const blocked = consumeRateLimit(["ip:1.2.3.4"]);
    expect(blocked.allowed).toBe(false);
    expect(blocked.retryAfterSeconds).toBeGreaterThan(0);
    expect(blocked.retryAfterSeconds).toBeLessThanOrEqual(
      Math.ceil(RATE_LIMIT_WINDOW_MS / 1_000),
    );
  });

  it("does not consume an attempt when any key is blocked", () => {
    for (let attempt = 0; attempt < RATE_LIMIT_MAX_ATTEMPTS; attempt += 1) {
      consumeRateLimit(["acct:victim@example.com"]);
    }

    // The IP key is fresh; the shared account key is exhausted.
    expect(
      consumeRateLimit(["ip:9.9.9.9", "acct:victim@example.com"]).allowed,
    ).toBe(false);
    expect(isRateLimited(["ip:9.9.9.9"])).toBe(false);
  });

  it("keeps windows independent per key", () => {
    for (let attempt = 0; attempt < RATE_LIMIT_MAX_ATTEMPTS; attempt += 1) {
      consumeRateLimit(["ip:a"]);
    }
    expect(isRateLimited(["ip:a"])).toBe(true);
    expect(isRateLimited(["ip:b"])).toBe(false);
  });

  it("resets after the window elapses", () => {
    const start = 1_000_000;
    for (let attempt = 0; attempt < RATE_LIMIT_MAX_ATTEMPTS; attempt += 1) {
      consumeRateLimit(["ip:a"], start);
    }
    expect(isRateLimited(["ip:a"], start + RATE_LIMIT_WINDOW_MS - 1)).toBe(true);
    expect(isRateLimited(["ip:a"], start + RATE_LIMIT_WINDOW_MS)).toBe(false);
    expect(consumeRateLimit(["ip:a"], start + RATE_LIMIT_WINDOW_MS).allowed).toBe(
      true,
    );
  });

  it("is read-only", () => {
    expect(isRateLimited(["ip:a"])).toBe(false);
    expect(isRateLimited(["ip:a"])).toBe(false);
    expect(consumeRateLimit(["ip:a"]).allowed).toBe(true);
  });

  it("allows calls with no keys", () => {
    expect(consumeRateLimit([])).toEqual({
      allowed: true,
      retryAfterSeconds: 0,
    });
  });
});

describe("clientIp", () => {
  it("takes the first x-forwarded-for hop", () => {
    const headers = new Headers({
      "x-forwarded-for": "203.0.113.7, 10.0.0.1",
    });
    expect(clientIp(headers)).toBe("203.0.113.7");
  });

  it("falls back to x-real-ip, then to unknown", () => {
    expect(clientIp(new Headers({ "x-real-ip": "198.51.100.4" }))).toBe(
      "198.51.100.4",
    );
    expect(clientIp(new Headers())).toBe("unknown");
    expect(clientIp(new Headers({ "x-forwarded-for": "  " }))).toBe("unknown");
  });
});

describe("loginRateLimitKeys", () => {
  it("normalises the account key and skips an empty email", () => {
    expect(loginRateLimitKeys("1.1.1.1", " Demo@Example.COM ")).toEqual([
      "ip:1.1.1.1",
      "acct:demo@example.com",
    ]);
    expect(loginRateLimitKeys("1.1.1.1", "")).toEqual(["ip:1.1.1.1"]);
  });
});
