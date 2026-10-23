import { beforeEach, describe, expect, it, vi } from "vitest";

const session = vi.hoisted(() => ({
  value: null as null | { user: { id?: string } },
}));

vi.mock("@/auth", () => ({
  auth: async () => session.value,
}));

vi.mock("next/navigation", () => ({
  redirect: (url: string): never => {
    throw new Error(`REDIRECT:${url}`);
  },
}));

import { encodeNextPath, requireUserId, safeNextPath } from "./session";

beforeEach(() => {
  session.value = null;
});

describe("encodeNextPath", () => {
  it("keeps internal slashes readable in the sign-in URL", () => {
    expect(encodeNextPath("/account/orders")).toBe("/account/orders");
    expect(encodeNextPath("/checkout?step=2")).toBe("/checkout%3Fstep%3D2");
  });
});

describe("safeNextPath", () => {
  it("accepts an internal path", () => {
    expect(safeNextPath("/account")).toBe("/account");
    expect(safeNextPath(["/checkout", "/ignored"])).toBe("/checkout");
  });

  it("falls back to the account page for missing or external targets", () => {
    expect(safeNextPath(undefined)).toBe("/account");
    expect(safeNextPath("https://evil.example")).toBe("/account");
    expect(safeNextPath("//evil.example")).toBe("/account");
    expect(safeNextPath("/\\evil.example")).toBe("/account");
  });
});

describe("requireUserId", () => {
  it("redirects anonymous visitors to sign in with the requested path", async () => {
    await expect(requireUserId("/checkout")).rejects.toThrow(
      "REDIRECT:/signin?next=/checkout",
    );
  });

  it("returns the signed-in user id", async () => {
    session.value = { user: { id: "user-9" } };
    await expect(requireUserId("/checkout")).resolves.toBe("user-9");
  });
});
