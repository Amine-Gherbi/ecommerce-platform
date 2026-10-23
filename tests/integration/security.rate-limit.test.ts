import { randomUUID } from "node:crypto";

import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/auth", async () => {
  const { sessionStorage } = await import("./helpers/session");
  return {
    auth: async () => {
      const store = sessionStorage.getStore();
      return store === undefined ? null : { user: { id: store.userId } };
    },
  };
});

import { POST } from "@/app/api/checkout/route";
import { db } from "@/lib/db";
import { resetRateLimit } from "@/lib/rate-limit";

import {
  cleanupFixture,
  createCart,
  createCatalog,
  createUsers,
  runMigrations,
  type CatalogFixture,
} from "./helpers/fixtures";
import { checkoutRequest, readCheckout } from "./helpers/http";
import { withUser } from "./helpers/session";

// 5 attempts per minute, per IP and per account. The sixth attempt is a 429
// with a Retry-After header, before any work is done.

let catalog: CatalogFixture;
let userId: string;
let cartVersion: string;

beforeAll(async () => {
  runMigrations();
  catalog = await createCatalog({
    stock: 10,
    priceCents: 1_200,
    label: "rate-limit",
  });
  const users = await createUsers("rate-limit", 1);
  const first = users[0];
  if (first === undefined) {
    throw new Error("no user fixture");
  }
  userId = first;

  const cart = await createCart(userId, [
    { variantId: catalog.variantId, quantity: 1 },
  ]);
  cartVersion = cart.cartVersion;
}, 120_000);

beforeEach(() => {
  resetRateLimit();
});

afterAll(async () => {
  await cleanupFixture({ userIds: [userId], catalogs: [catalog] });
  await db.$disconnect();
});

function body(): { addressId: string; cartVersion: string } {
  return { addressId: randomUUID(), cartVersion };
}

describe("checkout rate limit", () => {
  it("returns 429 on the sixth attempt from one address", async () => {
    const statuses: number[] = [];
    let retryAfter: string | null = null;

    for (let attempt = 0; attempt < 6; attempt += 1) {
      const response = await withUser(userId, () =>
        POST(checkoutRequest(body(), "203.0.113.50")),
      );
      const parsed = await readCheckout(response);
      statuses.push(parsed.status);
      if (parsed.status === 429) {
        retryAfter = response.headers.get("retry-after");
        expect(parsed.body.error).toBe("RATE_LIMITED");
      }
    }

    // Five attempts were allowed through (the first creates or replays the
    // order, the rest replay it); the sixth never reached the checkout core.
    expect(
      statuses.slice(0, 5).every((status) => status === 200 || status === 201),
    ).toBe(true);
    expect(statuses[5]).toBe(429);
    expect(retryAfter).not.toBeNull();
    expect(Number(retryAfter)).toBeGreaterThan(0);
    expect(Number(retryAfter)).toBeLessThanOrEqual(60);
  });

  it("limits per account even when the address changes", async () => {
    const statuses: number[] = [];

    for (let attempt = 0; attempt < 6; attempt += 1) {
      const response = await withUser(userId, () =>
        POST(
          checkoutRequest(body(), `192.0.2.${100 + attempt}`),
        ),
      );
      statuses.push((await readCheckout(response)).status);
    }

    expect(
      statuses.slice(0, 5).every((status) => status === 200 || status === 201),
    ).toBe(true);
    expect(statuses[5]).toBe(429);
  });

  it("answers 401 without a session and 403 cross-origin", async () => {
    const unauthenticated = await POST(
      checkoutRequest(body(), "192.0.2.200"),
    );
    expect((await readCheckout(unauthenticated)).status).toBe(401);

    const crossOrigin = await withUser(userId, () =>
      POST(
        checkoutRequest(body(), "192.0.2.201", {
          origin: "https://evil.example",
        }),
      ),
    );
    expect((await readCheckout(crossOrigin)).status).toBe(403);
  });
});
