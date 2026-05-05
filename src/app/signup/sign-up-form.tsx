"use client";

import { useActionState, useState } from "react";
import { useFormStatus } from "react-dom";

import { fieldClass, labelClass, primaryButtonClass } from "@/lib/styles";
import { cn } from "@/lib/utils";

import { signUpAction } from "./actions";
import { initialSignUpState } from "./state";

function SubmitButton() {
  const { pending } = useFormStatus();

  return (
    <button
      type="submit"
      disabled={pending}
      className={cn(primaryButtonClass, "w-full")}
    >
      {pending ? "Creating account…" : "Create account"}
    </button>
  );
}

export function SignUpForm() {
  const [state, formAction] = useActionState(signUpAction, initialSignUpState);
  // Keep the entered values across a validation error.
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmation, setConfirmation] = useState("");

  return (
    <form action={formAction} className="mt-8 flex flex-col gap-5">
      <div className="flex flex-col gap-2">
        <label htmlFor="signup-name" className={labelClass}>
          Name
        </label>
        <input
          id="signup-name"
          name="name"
          type="text"
          autoComplete="name"
          required
          value={name}
          onChange={(event) => setName(event.target.value)}
          className={fieldClass}
        />
      </div>

      <div className="flex flex-col gap-2">
        <label htmlFor="signup-email" className={labelClass}>
          Email
        </label>
        <input
          id="signup-email"
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
        <label htmlFor="signup-password" className={labelClass}>
          Password
        </label>
        <input
          id="signup-password"
          name="password"
          type="password"
          autoComplete="new-password"
          required
          aria-describedby="signup-password-hint"
          value={password}
          onChange={(event) => setPassword(event.target.value)}
          className={fieldClass}
        />
        <p id="signup-password-hint" className="text-[13px] leading-4 text-muted">
          At least 10 characters.
        </p>
      </div>

      <div className="flex flex-col gap-2">
        <label htmlFor="signup-confirmation" className={labelClass}>
          Confirm password
        </label>
        <input
          id="signup-confirmation"
          name="confirmation"
          type="password"
          autoComplete="new-password"
          required
          value={confirmation}
          onChange={(event) => setConfirmation(event.target.value)}
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
