"use client";

import { useActionState, useState } from "react";
import { useFormStatus } from "react-dom";

import { fieldClass, labelClass, primaryButtonClass } from "@/lib/styles";
import { cn } from "@/lib/utils";

import { signInAction } from "./actions";
import { initialSignInState } from "./state";

function SubmitButton() {
  const { pending } = useFormStatus();

  return (
    <button
      type="submit"
      disabled={pending}
      className={cn(primaryButtonClass, "w-full")}
    >
      {pending ? "Signing in…" : "Sign in"}
    </button>
  );
}

export function SignInForm({ next }: { next: string }) {
  const [state, formAction] = useActionState(signInAction, initialSignInState);
  // Controlled values survive React's automatic form reset after an action,
  // so a customer can correct a typo and submit again without retyping.
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  return (
    <form action={formAction} className="mt-8 flex flex-col gap-5">
      <input type="hidden" name="next" value={next} />

      <div className="flex flex-col gap-2">
        <label htmlFor="signin-email" className={labelClass}>
          Email
        </label>
        <input
          id="signin-email"
          name="email"
          type="email"
          autoComplete="email"
          required
          value={email}
          onChange={(event) => setEmail(event.target.value)}
          className={fieldClass}
        />
      </div>

      <div className="flex flex-col gap-2">
        <label htmlFor="signin-password" className={labelClass}>
          Password
        </label>
        <input
          id="signin-password"
          name="password"
          type="password"
          autoComplete="current-password"
          required
          value={password}
          onChange={(event) => setPassword(event.target.value)}
          className={fieldClass}
        />
      </div>

      <div aria-live="polite">
        {state.error !== null ? (
          <p
            role="alert"
            className="border-l-2 border-sale pl-3 text-[13px] leading-5 text-sale"
          >
            {state.error}
          </p>
        ) : null}
      </div>

      <SubmitButton />
    </form>
  );
}
