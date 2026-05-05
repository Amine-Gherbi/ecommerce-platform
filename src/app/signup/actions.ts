"use server";

import { hash } from "@node-rs/argon2";
import { Prisma } from "@prisma/client";
import { redirect } from "next/navigation";

import { signIn } from "@/auth";
import { isAuthFailureUrl } from "@/lib/auth-redirect";
import { mergeAnonymousCartIntoUserCart } from "@/lib/cart";
import { db } from "@/lib/db";

import type { SignUpState } from "./state";

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const MIN_PASSWORD_LENGTH = 10;

export async function signUpAction(
  _previous: SignUpState,
  formData: FormData,
): Promise<SignUpState> {
  const name = String(formData.get("name") ?? "").trim();
  const email = String(formData.get("email") ?? "")
    .trim()
    .toLowerCase();
  const password = String(formData.get("password") ?? "");
  const confirmation = String(formData.get("confirmation") ?? "");

  if (name.length === 0) {
    return { error: "Enter your name." };
  }
  if (!EMAIL_PATTERN.test(email)) {
    return { error: "Enter a valid email address." };
  }
  if (password.length < MIN_PASSWORD_LENGTH) {
    return { error: `Password must be at least ${MIN_PASSWORD_LENGTH} characters.` };
  }
  if (password !== confirmation) {
    return { error: "Passwords do not match." };
  }

  let userId: string;
  try {
    const user = await db.user.create({
      data: {
        name,
        email,
        passwordHash: await hash(password),
        // Sign-up is a customer path by definition; the UI has no way to
        // request ADMIN.
        role: "CUSTOMER",
      },
      select: { id: true },
    });
    userId = user.id;
  } catch (error: unknown) {
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === "P2002"
    ) {
      return {
        error: "An account with this email already exists. Sign in instead.",
      };
    }

    console.error("signUpAction failed", error);
    return { error: "The account could not be created. Try again." };
  }

  try {
    const result = await signIn("credentials", {
      email,
      password,
      redirect: false,
      redirectTo: "/account",
    });

    if (typeof result !== "string" || isAuthFailureUrl(result)) {
      return {
        error:
          "Your account was created, but signing in failed. Go to sign in and use your new password.",
      };
    }
  } catch (error: unknown) {
    console.error("sign-in after sign-up failed", error);
    return {
      error:
        "Your account was created, but signing in failed. Go to sign in and use your new password.",
    };
  }

  try {
    await mergeAnonymousCartIntoUserCart(userId);
  } catch (error: unknown) {
    console.error("cart merge after sign-up failed", error);
  }

  redirect("/account");
}
