import { beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({
  signIn: vi.fn(),
  merge: vi.fn(),
  mergedUserIds: [] as string[],
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

vi.mock("next/navigation", () => ({
  redirect: (url: string): never => {
    throw new Error(`REDIRECT:${url}`);
  },
}));

import { signUpAction } from "@/app/signup/actions";

import { resetDatabase, testDb } from "./helpers";

beforeEach(async () => {
  await resetDatabase();
  state.signIn.mockReset();
  state.signIn.mockResolvedValue("http://localhost/account");
  state.merge.mockReset();
  state.merge.mockResolvedValue(undefined);
  state.mergedUserIds = [];
});

function signUpForm(overrides: Record<string, string> = {}): FormData {
  const values: Record<string, string> = {
    name: "Ada Lovelace",
    email: "ada@example.test",
    password: "correct-horse-battery",
    confirmation: "correct-horse-battery",
    ...overrides,
  };
  const form = new FormData();
  for (const [key, value] of Object.entries(values)) {
    form.set(key, value);
  }
  return form;
}

describe("signUpAction validation", () => {
  it("rejects an empty name, bad email, short or mismatched password", async () => {
    const cases: [Record<string, string>, string][] = [
      [{ name: "   " }, "Enter your name."],
      [{ email: "not-an-email" }, "Enter a valid email address."],
      [{ password: "short", confirmation: "short" }, "Password must be at least 10 characters."],
      [{ confirmation: "different-password" }, "Passwords do not match."],
    ];

    for (const [overrides, message] of cases) {
      await expect(
        signUpAction({ error: null }, signUpForm(overrides)),
      ).resolves.toEqual({ error: message });
    }

    expect(await testDb.user.count()).toBe(0);
    expect(state.signIn).not.toHaveBeenCalled();
  });
});

describe("signUpAction account creation", () => {
  it("refuses a duplicate email and says how to recover", async () => {
    await testDb.user.create({
      data: {
        email: "ada@example.test",
        passwordHash: "existing",
        name: "Existing Ada",
      },
    });

    await expect(
      signUpAction({ error: null }, signUpForm()),
    ).resolves.toEqual({
      error: "An account with this email already exists. Sign in instead.",
    });
    expect(await testDb.user.count()).toBe(1);
  });

  it("creates a customer, signs in, merges the cart and lands on the account page", async () => {
    await expect(
      signUpAction(
        { error: null },
        signUpForm({
          name: "  Ada Lovelace  ",
          email: "  ADA@Example.TEST  ",
        }),
      ),
    ).rejects.toThrow("REDIRECT:/account");

    const user = await testDb.user.findUniqueOrThrow({
      where: { email: "ada@example.test" },
    });
    expect(user.name).toBe("Ada Lovelace");
    expect(user.role).toBe("CUSTOMER");
    // The stored value is a hash, never the submitted password.
    expect(user.passwordHash).not.toBe("correct-horse-battery");
    expect(user.passwordHash.length).toBeGreaterThan(20);
    expect(state.mergedUserIds).toEqual([user.id]);
    expect(state.signIn).toHaveBeenCalledWith("credentials", {
      email: "ada@example.test",
      password: "correct-horse-battery",
      redirect: false,
      redirectTo: "/account",
    });
  });

  it("reports a signed-up account when automatic sign-in fails", async () => {
    state.signIn.mockResolvedValue(
      "http://localhost/signin?error=CredentialsSignin",
    );

    await expect(
      signUpAction({ error: null }, signUpForm()),
    ).resolves.toEqual({
      error:
        "Your account was created, but signing in failed. Go to sign in and use your new password.",
    });
    expect(await testDb.user.count()).toBe(1);
  });

  it("reports a signed-up account when automatic sign-in throws", async () => {
    state.signIn.mockRejectedValue(new Error("auth unavailable"));

    await expect(
      signUpAction({ error: null }, signUpForm()),
    ).resolves.toEqual({
      error:
        "Your account was created, but signing in failed. Go to sign in and use your new password.",
    });
    expect(await testDb.user.count()).toBe(1);
  });

  it("still completes sign-up when the cart merge fails", async () => {
    state.merge.mockRejectedValue(new Error("cookie store unavailable"));

    await expect(
      signUpAction({ error: null }, signUpForm()),
    ).rejects.toThrow("REDIRECT:/account");
    expect(await testDb.user.count()).toBe(1);
  });
});
