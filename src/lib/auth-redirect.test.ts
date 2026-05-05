import { describe, expect, it } from "vitest";

import { isAuthFailureUrl } from "./auth-redirect";

describe("isAuthFailureUrl", () => {
  it("recognises the CredentialsSignin redirect Auth.js returns", () => {
    expect(
      isAuthFailureUrl(
        "http://localhost:3000/signin?error=CredentialsSignin&code=credentials",
      ),
    ).toBe(true);
  });

  it("returns false for a successful destination, relative or absolute", () => {
    expect(isAuthFailureUrl("/account")).toBe(false);
    expect(isAuthFailureUrl("http://localhost:3000/account")).toBe(false);
  });

  it("treats an empty result as a failure", () => {
    expect(isAuthFailureUrl("")).toBe(true);
  });
});
