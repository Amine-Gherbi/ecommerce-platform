// Fixed-window, in-process limiter for failed credential sign-ins.
//
// Five failures per email + IP in any rolling minute. A successful sign-in
// clears the bucket, so a legitimate customer is never locked out after
// mistyping a password a few times. The store is intentionally module-local:
// this demo runs as one Next process, and a restart simply resets the window.

const WINDOW_MS = 60_000;
const MAX_FAILURES = 5;

const failures = new Map<string, number[]>();

export function signInRateLimitKey(email: string, ip: string): string {
  return `${email.trim().toLowerCase()}|${ip.trim()}`;
}

function recentFailures(key: string, now: number): number[] {
  const entries = failures.get(key);
  if (entries === undefined) {
    return [];
  }

  const recent = entries.filter((at) => now - at < WINDOW_MS);
  if (recent.length === 0) {
    failures.delete(key);
  } else if (recent.length !== entries.length) {
    failures.set(key, recent);
  }
  return recent;
}

export function isRateLimited(key: string, now = Date.now()): boolean {
  return recentFailures(key, now).length >= MAX_FAILURES;
}

export function recordFailedAttempt(key: string, now = Date.now()): void {
  const recent = recentFailures(key, now);
  recent.push(now);
  failures.set(key, recent);
}

export function resetRateLimit(key: string): void {
  failures.delete(key);
}

// Test-only helper; the application never clears every bucket at once.
export function clearRateLimits(): void {
  failures.clear();
}
