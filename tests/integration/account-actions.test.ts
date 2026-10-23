import { describe, expect, it, vi } from "vitest";

const signOut = vi.hoisted(() => vi.fn());

vi.mock("@/auth", () => ({ signOut }));

import { signOutAction } from "@/app/account/actions";

describe("signOutAction", () => {
  it("ends the session and returns to the storefront", async () => {
    signOut.mockResolvedValue(undefined);

    await signOutAction();

    expect(signOut).toHaveBeenCalledWith({ redirectTo: "/" });
  });
});
