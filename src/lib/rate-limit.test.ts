import { beforeEach, describe, expect, it } from "vitest";

import {
  clearRateLimits,
  isRateLimited,
  recordFailedAttempt,
  resetRateLimit,
  signInRateLimitKey,
} from "./rate-limit";

const MINUTE = 60_000;

beforeEach(() => {
  clearRateLimits();
});

describe("sign-in rate limiting", () => {
  it("allows five failures and blocks the sixth inside the window", () => {
    const key = signInRateLimitKey(" Demo@Kestrel.test ", "127.0.0.1");

    for (let attempt = 0; attempt < 5; attempt += 1) {
      expect(isRateLimited(key, attempt)).toBe(false);
      recordFailedAttempt(key, attempt);
    }

    expect(isRateLimited(key, 6)).toBe(true);
  });

  it("forgets failures once the window expires", () => {
    const key = signInRateLimitKey("demo@kestrel.test", "127.0.0.1");

    for (let attempt = 0; attempt < 5; attempt += 1) {
      recordFailedAttempt(key, attempt);
    }

    expect(isRateLimited(key, MINUTE + 1)).toBe(false);
  });

  it("keys attempts by email and IP together", () => {
    const first = signInRateLimitKey("demo@kestrel.test", "10.0.0.1");
    const second = signInRateLimitKey("demo@kestrel.test", "10.0.0.2");
    const third = signInRateLimitKey("other@kestrel.test", "10.0.0.1");

    for (let attempt = 0; attempt < 5; attempt += 1) {
      recordFailedAttempt(first, attempt);
    }

    expect(isRateLimited(first, 5)).toBe(true);
    expect(isRateLimited(second, 5)).toBe(false);
    expect(isRateLimited(third, 5)).toBe(false);
  });

  it("clears the bucket after a successful sign-in", () => {
    const key = signInRateLimitKey("demo@kestrel.test", "127.0.0.1");

    for (let attempt = 0; attempt < 5; attempt += 1) {
      recordFailedAttempt(key, attempt);
    }
    resetRateLimit(key);

    expect(isRateLimited(key, 6)).toBe(false);
  });
});
