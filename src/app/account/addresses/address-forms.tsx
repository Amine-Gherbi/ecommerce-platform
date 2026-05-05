"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";

import { fieldClass, labelClass, primaryButtonClass } from "@/lib/styles";
import { cn } from "@/lib/utils";

import { deleteAddress } from "./actions";
import {
  initialAddressFormState,
  type AddressFormAction,
  type AddressFormValues,
} from "./state";

function SubmitButton({ label }: { label: string }) {
  const { pending } = useFormStatus();

  return (
    <button
      type="submit"
      disabled={pending}
      className={cn(primaryButtonClass, "w-full sm:w-auto")}
    >
      {pending ? "Saving…" : label}
    </button>
  );
}

function DeleteButton() {
  const { pending } = useFormStatus();

  return (
    <button
      type="submit"
      disabled={pending}
      className={cn(
        "text-[13px] text-muted transition-colors hover:text-ink disabled:opacity-40",
        "underline decoration-transparent underline-offset-4 hover:decoration-ink",
      )}
    >
      {pending ? "Deleting…" : "Delete"}
    </button>
  );
}

function FieldError({ message }: { message: string }) {
  return (
    <p
      role="alert"
      className="border-l-2 border-sale pl-3 text-[13px] leading-5 text-sale"
    >
      {message}
    </p>
  );
}

export function AddressForm({
  action,
  initial,
  submitLabel,
}: {
  action: AddressFormAction;
  initial?: AddressFormValues;
  submitLabel: string;
}) {
  const [state, formAction] = useActionState(
    action,
    initialAddressFormState,
  );
  const prefix = initial?.id ?? "new";

  return (
    <form action={formAction} className="grid gap-4 sm:grid-cols-2">
      {initial?.id !== undefined ? (
        <input type="hidden" name="id" value={initial.id} />
      ) : null}

      <div className="flex flex-col gap-2">
        <label htmlFor={`${prefix}-label`} className={labelClass}>
          Label
        </label>
        <input
          id={`${prefix}-label`}
          name="label"
          type="text"
          defaultValue={initial?.label ?? ""}
          placeholder="Home"
          required
          className={fieldClass}
        />
      </div>

      <div className="flex flex-col gap-2">
        <label htmlFor={`${prefix}-country`} className={labelClass}>
          Country
        </label>
        <input
          id={`${prefix}-country`}
          name="country"
          type="text"
          defaultValue={initial?.country ?? ""}
          autoComplete="country-name"
          required
          className={fieldClass}
        />
      </div>

      <div className="flex flex-col gap-2 sm:col-span-2">
        <label htmlFor={`${prefix}-line1`} className={labelClass}>
          Street address
        </label>
        <input
          id={`${prefix}-line1`}
          name="line1"
          type="text"
          defaultValue={initial?.line1 ?? ""}
          autoComplete="address-line1"
          required
          className={fieldClass}
        />
      </div>

      <div className="flex flex-col gap-2 sm:col-span-2">
        <label htmlFor={`${prefix}-line2`} className={labelClass}>
          Apartment, suite, etc. (optional)
        </label>
        <input
          id={`${prefix}-line2`}
          name="line2"
          type="text"
          defaultValue={initial?.line2 ?? ""}
          autoComplete="address-line2"
          className={fieldClass}
        />
      </div>

      <div className="flex flex-col gap-2">
        <label htmlFor={`${prefix}-city`} className={labelClass}>
          City
        </label>
        <input
          id={`${prefix}-city`}
          name="city"
          type="text"
          defaultValue={initial?.city ?? ""}
          autoComplete="address-level2"
          required
          className={fieldClass}
        />
      </div>

      <div className="flex flex-col gap-2">
        <label htmlFor={`${prefix}-postal`} className={labelClass}>
          Postal code
        </label>
        <input
          id={`${prefix}-postal`}
          name="postalCode"
          type="text"
          defaultValue={initial?.postalCode ?? ""}
          autoComplete="postal-code"
          required
          className={fieldClass}
        />
      </div>

      <label className="flex items-center gap-2 text-[13px] leading-5 text-muted sm:col-span-2">
        <input
          type="checkbox"
          name="isDefault"
          defaultChecked={initial?.isDefault ?? false}
        />
        Set as default address
      </label>

      <div aria-live="polite" className="sm:col-span-2">
        {state.error !== null ? <FieldError message={state.error} /> : null}
        {state.ok ? (
          <p className="text-[13px] leading-5 text-muted">Address saved.</p>
        ) : null}
      </div>

      <div className="sm:col-span-2">
        <SubmitButton label={submitLabel} />
      </div>
    </form>
  );
}

export function DeleteAddressForm({ addressId }: { addressId: string }) {
  const [state, formAction] = useActionState(
    deleteAddress,
    initialAddressFormState,
  );

  return (
    <form action={formAction} className="flex flex-col gap-2">
      <input type="hidden" name="id" value={addressId} />
      <DeleteButton />
      <div aria-live="polite">
        {state.error !== null ? <FieldError message={state.error} /> : null}
      </div>
    </form>
  );
}
