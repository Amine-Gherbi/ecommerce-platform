"use server";

import { revalidatePath } from "next/cache";

import { db } from "@/lib/db";
import { requireUserId } from "@/lib/session";

import type { AddressFormState } from "./state";

interface AddressFields {
  label: string;
  line1: string;
  line2: string | null;
  city: string;
  postalCode: string;
  country: string;
}

type ParsedAddress =
  | { ok: true; value: AddressFields }
  | { ok: false; error: string };

function field(formData: FormData, name: string): string {
  return String(formData.get(name) ?? "").trim();
}

function parseAddress(formData: FormData): ParsedAddress {
  const label = field(formData, "label");
  const line1 = field(formData, "line1");
  const line2 = field(formData, "line2");
  const city = field(formData, "city");
  const postalCode = field(formData, "postalCode");
  const country = field(formData, "country");

  if (label.length === 0) {
    return { ok: false, error: "Give this address a label, such as Home." };
  }
  if (line1.length === 0) {
    return { ok: false, error: "Enter the street address." };
  }
  if (city.length === 0) {
    return { ok: false, error: "Enter the city." };
  }
  if (postalCode.length === 0) {
    return { ok: false, error: "Enter the postal code." };
  }
  if (country.length === 0) {
    return { ok: false, error: "Enter the country." };
  }

  return {
    ok: true,
    value: {
      label,
      line1,
      line2: line2.length > 0 ? line2 : null,
      city,
      postalCode,
      country,
    },
  };
}

function revalidateAddresses(): void {
  revalidatePath("/account/addresses");
  revalidatePath("/account");
}

export async function addAddress(
  _previous: AddressFormState,
  formData: FormData,
): Promise<AddressFormState> {
  const userId = await requireUserId("/account/addresses");
  const parsed = parseAddress(formData);
  if (!parsed.ok) {
    return { error: parsed.error, ok: false };
  }

  const wantsDefault = formData.get("isDefault") === "on";

  try {
    await db.$transaction(async (tx) => {
      const existing = await tx.address.count({ where: { userId } });
      const isDefault = existing === 0 || wantsDefault;

      if (isDefault) {
        await tx.address.updateMany({
          where: { userId },
          data: { isDefault: false },
        });
      }

      await tx.address.create({
        data: { ...parsed.value, userId, isDefault },
      });
    });
  } catch (error: unknown) {
    console.error("addAddress failed", error);
    return { error: "The address could not be saved. Try again.", ok: false };
  }

  revalidateAddresses();
  return { error: null, ok: true };
}

export async function updateAddress(
  _previous: AddressFormState,
  formData: FormData,
): Promise<AddressFormState> {
  const userId = await requireUserId("/account/addresses");
  const id = field(formData, "id");
  const parsed = parseAddress(formData);
  if (!parsed.ok) {
    return { error: parsed.error, ok: false };
  }

  const address = await db.address.findFirst({
    where: { id, userId },
    select: { id: true },
  });
  if (address === null) {
    return { error: "That address no longer exists.", ok: false };
  }

  const wantsDefault = formData.get("isDefault") === "on";

  try {
    await db.$transaction(async (tx) => {
      if (wantsDefault) {
        await tx.address.updateMany({
          where: { userId },
          data: { isDefault: false },
        });
      }

      await tx.address.update({
        where: { id: address.id },
        data: {
          ...parsed.value,
          ...(wantsDefault ? { isDefault: true } : {}),
        },
      });
    });
  } catch (error: unknown) {
    console.error("updateAddress failed", error);
    return { error: "The address could not be saved. Try again.", ok: false };
  }

  revalidateAddresses();
  return { error: null, ok: true };
}

export async function setDefaultAddress(formData: FormData): Promise<void> {
  const userId = await requireUserId("/account/addresses");
  const id = field(formData, "id");

  await db.$transaction(async (tx) => {
    const address = await tx.address.findFirst({
      where: { id, userId },
      select: { id: true },
    });
    if (address === null) {
      return;
    }

    await tx.address.updateMany({
      where: { userId },
      data: { isDefault: false },
    });
    await tx.address.update({
      where: { id: address.id },
      data: { isDefault: true },
    });
  });

  revalidateAddresses();
}

export async function deleteAddress(
  _previous: AddressFormState,
  formData: FormData,
): Promise<AddressFormState> {
  const userId = await requireUserId("/account/addresses");
  const id = field(formData, "id");

  let refusal: string | null;

  try {
    refusal = await db.$transaction(async (tx): Promise<string | null> => {
      const address = await tx.address.findFirst({
        where: { id, userId },
        select: { id: true, isDefault: true },
      });
      if (address === null) {
        return "That address no longer exists.";
      }

      const count = await tx.address.count({ where: { userId } });
      if (count <= 1) {
        return "You cannot delete your only address. Add another address first.";
      }

      await tx.address.delete({ where: { id: address.id } });

      if (address.isDefault) {
        const fallback = await tx.address.findFirst({
          where: { userId },
          orderBy: { label: "asc" },
          select: { id: true },
        });
        if (fallback !== null) {
          await tx.address.update({
            where: { id: fallback.id },
            data: { isDefault: true },
          });
        }
      }

      return null;
    });
  } catch (error: unknown) {
    console.error("deleteAddress failed", error);
    return { error: "The address could not be deleted. Try again.", ok: false };
  }

  if (refusal !== null) {
    return { error: refusal, ok: false };
  }

  revalidateAddresses();
  return { error: null, ok: true };
}
