"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";

import { signIn } from "@/auth";
import { isAuthFailureUrl } from "@/lib/auth-redirect";
import { mergeAnonymousCartIntoUserCart } from "@/lib/cart";
import { db } from "@/lib/db";
import {
  isRateLimited,
  recordFailedAttempt,
  resetRateLimit,
  signInRateLimitKey,
} from "@/lib/rate-limit";
import { safeNextPath } from "@/lib/session";

import type { SignInState } from "./state";

const INVALID_CREDENTIALS = "Email or password is incorrect.";
const RATE_LIMITED =
  "Too many sign-in attempts. Wait a minute, then try again.";

async function clientIp(): Promise<string> {
  const store = await headers();
  const forwarded = store.get("x-forwarded-for");
  if (forwarded !== null && forwarded.length > 0) {
    return forwarded.split(",")[0]?.trim() ?? "local";
  }
  return store.get("x-real-ip")?.trim() ?? "local";
}

export async function signInAction(
  _previous: SignInState,
  formData: FormData,
): Promise<SignInState> {
  const email = String(formData.get("email") ?? "")
    .trim()
    .toLowerCase();
  const password = String(formData.get("password") ?? "");
  const nextValue = formData.get("next");
  const requestedNext =
    typeof nextValue === "string" && nextValue.trim().length > 0
      ? safeNextPath(nextValue)
      : null;

  if (email.length === 0 || password.length === 0) {
    return { error: "Enter your email and password to sign in." };
  }

  const key = signInRateLimitKey(email, await clientIp());
  if (isRateLimited(key)) {
    return { error: RATE_LIMITED };
  }

  let redirectUrl = "";
  try {
    const result = await signIn("credentials", {
      email,
      password,
      redirect: false,
      redirectTo: requestedNext ?? "/account",
    });
    redirectUrl = typeof result === "string" ? result : "";
  } catch (error: unknown) {
    console.error("signInAction failed", error);
    recordFailedAttempt(key);
    return { error: INVALID_CREDENTIALS };
  }

  if (isAuthFailureUrl(redirectUrl)) {
    recordFailedAttempt(key);
    return { error: INVALID_CREDENTIALS };
  }

  const user = await db.user.findUnique({
    where: { email },
    select: { id: true, role: true },
  });
  if (user === null) {
    recordFailedAttempt(key);
    return { error: INVALID_CREDENTIALS };
  }

  // A failed merge must not turn a valid sign-in into an error: the anonymous
  // cookie stays put and the next sign-in can try again.
  try {
    await mergeAnonymousCartIntoUserCart(user.id);
  } catch (error: unknown) {
    console.error("cart merge after sign-in failed", error);
  }

  resetRateLimit(key);
  redirect(
    requestedNext ?? (user.role === "ADMIN" ? "/admin" : "/account"),
  );
}
