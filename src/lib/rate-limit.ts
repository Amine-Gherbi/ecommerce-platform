// A fixed-window attempt counter used by the credentials sign-in path.
//
// Two keys are consumed per attempt — one for the IP and one for the account —
// and an attempt is refused if *either* window is exhausted. State is in
// process memory: this is a local, single-instance deployment, and the limit is
// a brute-force speed bump rather than a billing control. A restart clears the
// windows, which fails open for at most one minute.

export const RATE_LIMIT_MAX_ATTEMPTS = 5;
export const RATE_LIMIT_WINDOW_MS = 60_000;

export interface RateLimitResult {
  allowed: boolean;
  /** Seconds until the blocking window resets; `0` when allowed. */
  retryAfterSeconds: number;
}

interface Bucket {
  count: number;
  resetAt: number;
}

const buckets = new Map<string, Bucket>();
const SWEEP_THRESHOLD = 1_000;

function bucketFor(key: string, now: number): Bucket {
  const existing = buckets.get(key);
  if (existing === undefined || existing.resetAt <= now) {
    const fresh: Bucket = { count: 0, resetAt: now + RATE_LIMIT_WINDOW_MS };
    buckets.set(key, fresh);
    return fresh;
  }
  return existing;
}

function sweep(now: number): void {
  if (buckets.size <= SWEEP_THRESHOLD) {
    return;
  }
  for (const [key, bucket] of buckets) {
    if (bucket.resetAt <= now) {
      buckets.delete(key);
    }
  }
}

function toResult(bucket: Bucket, now: number): RateLimitResult {
  return {
    allowed: false,
    retryAfterSeconds: Math.max(1, Math.ceil((bucket.resetAt - now) / 1_000)),
  };
}

/**
 * Consumes one attempt from every key. Returns `allowed: false` (without
 * consuming anything) when any key has already used its five attempts.
 */
export function consumeRateLimit(
  keys: readonly string[],
  now: number = Date.now(),
): RateLimitResult {
  const unique = [...new Set(keys)];
  if (unique.length === 0) {
    return { allowed: true, retryAfterSeconds: 0 };
  }

  sweep(now);

  const entries = unique.map((key) => [key, bucketFor(key, now)] as const);
  const blocked = entries.find(
    ([, bucket]) => bucket.count >= RATE_LIMIT_MAX_ATTEMPTS,
  );
  if (blocked !== undefined) {
    return toResult(blocked[1], now);
  }

  for (const [, bucket] of entries) {
    bucket.count += 1;
  }
  return { allowed: true, retryAfterSeconds: 0 };
}

/** Read-only check: reports whether a key is blocked without consuming. */
export function isRateLimited(
  keys: readonly string[],
  now: number = Date.now(),
): boolean {
  return keys.some((key) => {
    const bucket = buckets.get(key);
    return bucket !== undefined && bucket.resetAt > now &&
      bucket.count >= RATE_LIMIT_MAX_ATTEMPTS;
  });
}

/**
 * Best-effort client address. Behind a proxy the first `x-forwarded-for` hop is
 * the client; local development has neither header, so all clients share the
 * `unknown` bucket.
 */
export function clientIp(headers: Headers): string {
  const forwarded = headers.get("x-forwarded-for");
  const firstHop = forwarded?.split(",")[0]?.trim();
  if (firstHop !== undefined && firstHop.length > 0) {
    return firstHop;
  }
  const realIp = headers.get("x-real-ip")?.trim();
  if (realIp !== undefined && realIp.length > 0) {
    return realIp;
  }
  return "unknown";
}

/** Builds the per-IP and per-account keys used on the login route. */
export function loginRateLimitKeys(ip: string, email: string): string[] {
  const keys = [`ip:${ip}`];
  const account = email.trim().toLowerCase();
  if (account.length > 0) {
    keys.push(`acct:${account}`);
  }
  return keys;
}

/** Test helper: forget every window. */
export function resetRateLimit(): void {
  buckets.clear();
}
