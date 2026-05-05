import { beforeEach, describe, expect, it, vi } from "vitest";

const session = vi.hoisted(() => ({
  value: null as null | { user: { id?: string; role?: string } },
}));

vi.mock("@/auth", () => ({
  auth: async () => session.value,
}));

vi.mock("next/navigation", () => ({
  redirect: (url: string): never => {
    throw new Error(`REDIRECT:${url}`);
  },
}));

import { firstParam, formatOrderAge, requireAdmin } from "./admin";

beforeEach(() => {
  session.value = null;
});

describe("requireAdmin", () => {
  it("sends anonymous visitors to sign in and back to the admin path", async () => {
    await expect(requireAdmin("/admin/orders")).rejects.toThrow(
      "REDIRECT:/signin?next=/admin/orders",
    );
  });

  it("treats an empty session id as anonymous", async () => {
    session.value = { user: { id: "", role: "ADMIN" } };
    await expect(requireAdmin()).rejects.toThrow("REDIRECT:/signin?next=/admin");
  });

  it("sends a signed-in customer to the account page", async () => {
    session.value = { user: { id: "user-1", role: "CUSTOMER" } };
    await expect(requireAdmin()).rejects.toThrow("REDIRECT:/account");
  });

  it("returns the admin's user id", async () => {
    session.value = { user: { id: "admin-1", role: "ADMIN" } };
    await expect(requireAdmin()).resolves.toBe("admin-1");
  });
});

describe("firstParam", () => {
  it("normalises repeated query parameters to one value", () => {
    expect(firstParam(undefined)).toBeUndefined();
    expect(firstParam("page=2")).toBe("page=2");
    expect(firstParam(["a", "b"])).toBe("a");
  });
});

describe("formatOrderAge", () => {
  const now = new Date("2026-03-10T12:00:00.000Z");
  const minutesAgo = (minutes: number): Date =>
    new Date(now.getTime() - minutes * 60_000);

  it("keeps sub-minute ages under a minute", () => {
    expect(formatOrderAge(now, now)).toBe("<1m");
    expect(formatOrderAge(new Date(now.getTime() + 60_000), now)).toBe("<1m");
  });

  it("renders minutes, hours and days compactly", () => {
    expect(formatOrderAge(minutesAgo(7), now)).toBe("7m");
    expect(formatOrderAge(minutesAgo(3 * 60 + 20), now)).toBe("3h 20m");
    expect(formatOrderAge(minutesAgo(2 * 24 * 60 + 5 * 60), now)).toBe(
      "2d 5h",
    );
  });
});
