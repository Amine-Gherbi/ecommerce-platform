import { beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({
  signIn: vi.fn(),
  merge: vi.fn(),
  mergedUserIds: [] as string[],
  forwardedFor: null as string | null,
  realIp: null as string | null,
}));

vi.mock("@/auth", () => ({
  auth: async () => null,
  signIn: state.signIn,
}));

vi.mock("@/lib/cart", () => ({
  mergeAnonymousCartIntoUserCart: async (userId: string) => {
    state.mergedUserIds.push(userId);
    return state.merge(userId);
  },
}));

vi.mock("next/headers", () => ({
  headers: async () => ({
    get: (name: string) => {
      if (name === "x-forwarded-for") {
        return state.forwardedFor;
      }
      if (name === "x-real-ip") {
        return state.realIp;
      }
      return null;
    },
  }),
}));

vi.mock("next/navigation", () => ({
  redirect: (url: string): never => {
    throw new Error(`REDIRECT:${url}`);
  },
}));

import { signInAction } from "@/app/signin/actions";
import { clearRateLimits } from "@/lib/rate-limit";

import { resetDatabase, testDb } from "./helpers";

beforeEach(async () => {
  await resetDatabase();
  clearRateLimits();
  state.signIn.mockReset();
  state.merge.mockReset();
  state.merge.mockResolvedValue(undefined);
  state.mergedUserIds = [];
  state.forwardedFor = null;
  state.realIp = null;
});

function signInForm(
  email: string,
  password: string,
  next?: string,
): FormData {
  const form = new FormData();
  form.set("email", email);
  form.set("password", password);
  if (next !== undefined) {
    form.set("next", next);
  }
  return form;
}

async function makeUser(
  email: string,
  role: "CUSTOMER" | "ADMIN" = "CUSTOMER",
): Promise<string> {
  const user = await testDb.user.create({
    data: {
      email,
      passwordHash: "not-checked-here",
      name: "Test",
      role,
    },
    select: { id: true },
  });
  return user.id;
}

describe("signInAction validation", () => {
  it("requires both fields before signing in", async () => {
    await expect(
      signInAction({ error: null }, signInForm("", "")),
    ).resolves.toEqual({
      error: "Enter your email and password to sign in.",
    });
    await expect(
      signInAction({ error: null }, signInForm("demo@kestrel.test", "")),
    ).resolves.toEqual({
      error: "Enter your email and password to sign in.",
    });
    expect(state.signIn).not.toHaveBeenCalled();
  });
});

describe("signInAction failures", () => {
  it("turns a thrown credentials error into the same customer-facing message", async () => {
    state.signIn.mockRejectedValue(new Error("CredentialsSignin"));

    await expect(
      signInAction(
        { error: null },
        signInForm("demo@kestrel.test", "wrong"),
      ),
    ).resolves.toEqual({ error: "Email or password is incorrect." });
  });

  it("treats Auth.js's error URL as a failed sign-in", async () => {
    state.signIn.mockResolvedValue(
      "http://localhost/signin?error=CredentialsSignin",
    );

    await expect(
      signInAction(
        { error: null },
        signInForm("demo@kestrel.test", "wrong"),
      ),
    ).resolves.toEqual({ error: "Email or password is incorrect." });
  });

  it("fails closed when the signed-in email has no account row", async () => {
    state.signIn.mockResolvedValue("http://localhost/account");

    await expect(
      signInAction(
        { error: null },
        signInForm("ghost@kestrel.test", "whatever"),
      ),
    ).resolves.toEqual({ error: "Email or password is incorrect." });
    expect(state.mergedUserIds).toEqual([]);
  });

  it("rate limits after five failures for the same email and IP", async () => {
    state.forwardedFor = "203.0.113.7, 10.0.0.1";
    state.signIn.mockRejectedValue(new Error("CredentialsSignin"));

    for (let attempt = 0; attempt < 5; attempt += 1) {
      await signInAction(
        { error: null },
        signInForm("demo@kestrel.test", "wrong"),
      );
    }

    state.signIn.mockClear();
    await expect(
      signInAction(
        { error: null },
        signInForm("demo@kestrel.test", "wrong"),
      ),
    ).resolves.toEqual({
      error: "Too many sign-in attempts. Wait a minute, then try again.",
    });
    expect(state.signIn).not.toHaveBeenCalled();
  });

  it("keeps buckets separate per client IP", async () => {
    state.forwardedFor = "203.0.113.7";
    state.signIn.mockRejectedValue(new Error("CredentialsSignin"));
    for (let attempt = 0; attempt < 5; attempt += 1) {
      await signInAction(
        { error: null },
        signInForm("demo@kestrel.test", "wrong"),
      );
    }

    // Same email, different IP: a shared bucket would be a denial of service.
    state.forwardedFor = "198.51.100.9";
    await makeUser("demo@kestrel.test");
    state.signIn.mockResolvedValue("http://localhost/account");
    await expect(
      signInAction({ error: null }, signInForm("demo@kestrel.test", "right")),
    ).rejects.toThrow("REDIRECT:/account");
  });

  it("falls back to x-real-ip and then to a local bucket", async () => {
    state.realIp = "192.0.2.5";
    state.signIn.mockRejectedValue(new Error("CredentialsSignin"));
    for (let attempt = 0; attempt < 5; attempt += 1) {
      await signInAction(
        { error: null },
        signInForm("real@kestrel.test", "wrong"),
      );
    }

    // A different real IP is a different bucket, so it can still sign in.
    state.realIp = "192.0.2.6";
    await makeUser("real@kestrel.test");
    state.signIn.mockResolvedValue("http://localhost/account");
    await expect(
      signInAction({ error: null }, signInForm("real@kestrel.test", "right")),
    ).rejects.toThrow("REDIRECT:/account");

    // With no headers at all every request shares the "local" bucket.
    state.realIp = null;
    state.signIn.mockRejectedValue(new Error("CredentialsSignin"));
    for (let attempt = 0; attempt < 5; attempt += 1) {
      await signInAction(
        { error: null },
        signInForm("local@kestrel.test", "wrong"),
      );
    }
    await expect(
      signInAction(
        { error: null },
        signInForm("local@kestrel.test", "wrong"),
      ),
    ).resolves.toEqual({
      error: "Too many sign-in attempts. Wait a minute, then try again.",
    });
  });
});

describe("signInAction success", () => {
  it("merges the anonymous cart, clears the limiter and sends a customer to the account", async () => {
    const userId = await makeUser("demo@kestrel.test");
    state.signIn.mockResolvedValue("http://localhost/account");

    await expect(
      signInAction(
        { error: null },
        signInForm("demo@kestrel.test", "demo-password-123"),
      ),
    ).rejects.toThrow("REDIRECT:/account");
    expect(state.mergedUserIds).toEqual([userId]);
  });

  it("sends an admin to the admin console", async () => {
    await makeUser("admin@kestrel.test", "ADMIN");
    state.signIn.mockResolvedValue("http://localhost/admin");

    await expect(
      signInAction(
        { error: null },
        signInForm("admin@kestrel.test", "admin-password-123"),
      ),
    ).rejects.toThrow("REDIRECT:/admin");
  });

  it("honours an internal next path but never an external one", async () => {
    await makeUser("demo@kestrel.test");
    state.signIn.mockResolvedValue("http://localhost/checkout");

    await expect(
      signInAction(
        { error: null },
        signInForm("demo@kestrel.test", "pw", "/checkout"),
      ),
    ).rejects.toThrow("REDIRECT:/checkout");

    await expect(
      signInAction(
        { error: null },
        signInForm("demo@kestrel.test", "pw", "https://evil.example"),
      ),
    ).rejects.toThrow("REDIRECT:/account");
  });

  it("still signs the customer in when the cart merge fails", async () => {
    await makeUser("demo@kestrel.test");
    state.signIn.mockResolvedValue("http://localhost/account");
    state.merge.mockRejectedValue(new Error("cookie store unavailable"));

    await expect(
      signInAction({ error: null }, signInForm("demo@kestrel.test", "pw")),
    ).rejects.toThrow("REDIRECT:/account");
  });
});
