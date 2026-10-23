import { AsyncLocalStorage } from "node:async_hooks";

// The checkout route asks Auth.js who is calling. In integration tests the
// request is a plain `Request`, so there is no cookie jar for Auth.js to read.
// Each simulated HTTP call runs inside its own async context and the mocked
// `auth()` reads the user from there. AsyncLocalStorage keeps 20 concurrent
// checkouts by 20 different users from overwriting one shared variable.

export interface SessionContext {
  userId: string;
}

export const sessionStorage = new AsyncLocalStorage<SessionContext>();

export function withUser<T>(
  userId: string,
  fn: () => Promise<T>,
): Promise<T> {
  return sessionStorage.run({ userId }, fn);
}
