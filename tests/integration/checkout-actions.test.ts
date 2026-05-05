import { beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({
  sessionUserId: null as string | null,
  revalidated: [] as string[],
}));

vi.mock("@/auth", () => ({
  auth: async () =>
    state.sessionUserId === null
      ? null
      : { user: { id: state.sessionUserId, role: "CUSTOMER" } },
}));

vi.mock("next/cache", () => ({
  revalidatePath: (path: string) => {
    state.revalidated.push(path);
  },
}));

vi.mock("next/navigation", () => ({
  redirect: (url: string): never => {
    throw new Error(`REDIRECT:${url}`);
  },
}));

import { chooseDeliveryMethod } from "@/app/checkout/actions";

import { createUser, resetDatabase, testDb } from "./helpers";

beforeEach(async () => {
  await resetDatabase();
  state.sessionUserId = null;
  state.revalidated = [];
});

function deliveryForm(value: string): FormData {
  const form = new FormData();
  form.set("deliveryMethod", value);
  return form;
}

describe("chooseDeliveryMethod", () => {
  it("sends anonymous visitors to sign in for checkout", async () => {
    await expect(
      chooseDeliveryMethod(deliveryForm("EXPRESS")),
    ).rejects.toThrow("REDIRECT:/signin?next=/checkout");
  });

  it("ignores a delivery method the server does not offer", async () => {
    const userId = await createUser();
    state.sessionUserId = userId;
    const cart = await testDb.cart.create({
      data: { userId },
      select: { id: true },
    });

    await chooseDeliveryMethod(deliveryForm("FREE_NOW"));

    const after = await testDb.cart.findUniqueOrThrow({
      where: { id: cart.id },
      select: { deliveryMethod: true },
    });
    expect(after.deliveryMethod).toBe("STANDARD");
    expect(state.revalidated).toEqual([]);
  });

  it("does nothing when the signed-in customer has no cart", async () => {
    state.sessionUserId = await createUser();

    await chooseDeliveryMethod(deliveryForm("EXPRESS"));

    expect(await testDb.cart.count()).toBe(0);
    expect(state.revalidated).toEqual([]);
  });

  it("stores the server-side delivery choice on the cart", async () => {
    const userId = await createUser();
    state.sessionUserId = userId;
    const cart = await testDb.cart.create({
      data: { userId },
      select: { id: true },
    });

    await chooseDeliveryMethod(deliveryForm("EXPRESS"));

    const after = await testDb.cart.findUniqueOrThrow({
      where: { id: cart.id },
      select: { deliveryMethod: true },
    });
    expect(after.deliveryMethod).toBe("EXPRESS");
    expect(state.revalidated).toEqual(["/checkout"]);

    await chooseDeliveryMethod(deliveryForm("STANDARD"));
    const standard = await testDb.cart.findUniqueOrThrow({
      where: { id: cart.id },
      select: { deliveryMethod: true },
    });
    expect(standard.deliveryMethod).toBe("STANDARD");
  });
});
