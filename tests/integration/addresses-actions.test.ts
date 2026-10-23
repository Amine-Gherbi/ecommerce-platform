import { randomUUID } from "node:crypto";

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

import {
  addAddress,
  deleteAddress,
  setDefaultAddress,
  updateAddress,
} from "@/app/account/addresses/actions";

import type { AddressFormState } from "@/app/account/addresses/state";

import { createUser, resetDatabase, testDb } from "./helpers";

const initial: AddressFormState = { error: null, ok: false };

beforeEach(async () => {
  await resetDatabase();
  state.sessionUserId = null;
  state.revalidated = [];
});

function addressForm(overrides: Record<string, string> = {}): FormData {
  const values: Record<string, string> = {
    label: "Home",
    line1: "18 Rue de la République",
    city: "Lyon",
    postalCode: "69001",
    country: "France",
    ...overrides,
  };
  const form = new FormData();
  for (const [key, value] of Object.entries(values)) {
    form.set(key, value);
  }
  return form;
}

describe("addAddress", () => {
  it("requires the fields an address cannot be shipped without", async () => {
    state.sessionUserId = await createUser();

    const cases: [Record<string, string>, string][] = [
      [{ label: "  " }, "Give this address a label, such as Home."],
      [{ line1: "" }, "Enter the street address."],
      [{ city: "" }, "Enter the city."],
      [{ postalCode: "" }, "Enter the postal code."],
      [{ country: "" }, "Enter the country."],
    ];

    for (const [overrides, message] of cases) {
      await expect(addAddress(initial, addressForm(overrides))).resolves.toEqual(
        { error: message, ok: false },
      );
    }
    expect(await testDb.address.count()).toBe(0);
  });

  it("makes the first address the default even without the checkbox", async () => {
    const userId = await createUser();
    state.sessionUserId = userId;

    await expect(
      addAddress(initial, addressForm()),
    ).resolves.toEqual({ error: null, ok: true });

    const address = await testDb.address.findFirstOrThrow({
      where: { userId },
    });
    expect(address).toMatchObject({
      label: "Home",
      line1: "18 Rue de la République",
      line2: null,
      city: "Lyon",
      postalCode: "69001",
      country: "France",
      isDefault: true,
    });
    expect(state.revalidated).toEqual([
      "/account/addresses",
      "/account",
      "/checkout",
    ]);
  });

  it("moves the default when a later address asks for it", async () => {
    const userId = await createUser();
    state.sessionUserId = userId;
    const first = await testDb.address.create({
      data: {
        userId,
        label: "Home",
        line1: "1 Rue A",
        city: "Lyon",
        postalCode: "69001",
        country: "France",
        isDefault: true,
      },
      select: { id: true },
    });

    const form = addressForm({ label: "Studio", line2: "Floor 2" });
    form.set("isDefault", "on");
    await expect(addAddress(initial, form)).resolves.toEqual({
      error: null,
      ok: true,
    });

    const addresses = await testDb.address.findMany({
      where: { userId },
      orderBy: { label: "asc" },
    });
    expect(addresses.map((address) => [address.label, address.isDefault])).toEqual(
      [
        ["Home", false],
        ["Studio", true],
      ],
    );
    expect(addresses[1]?.line2).toBe("Floor 2");
    expect(
      await testDb.address.count({ where: { id: first.id, isDefault: true } }),
    ).toBe(0);
  });
});

describe("updateAddress", () => {
  it("reports invalid input and unknown addresses", async () => {
    const userId = await createUser();
    state.sessionUserId = userId;
    const address = await testDb.address.create({
      data: {
        userId,
        label: "Home",
        line1: "1 Rue A",
        city: "Lyon",
        postalCode: "69001",
        country: "France",
      },
      select: { id: true },
    });

    await expect(
      updateAddress(initial, addressForm({ label: "" })),
    ).resolves.toEqual({
      error: "Give this address a label, such as Home.",
      ok: false,
    });

    const missing = addressForm();
    missing.set("id", randomUUID());
    await expect(updateAddress(initial, missing)).resolves.toEqual({
      error: "That address no longer exists.",
      ok: false,
    });

    // Another customer's address is not editable, even with its real id.
    const strangerForm = addressForm();
    strangerForm.set("id", address.id);
    state.sessionUserId = await createUser();
    await expect(updateAddress(initial, strangerForm)).resolves.toEqual({
      error: "That address no longer exists.",
      ok: false,
    });
  });

  it("updates fields, optionally promoting the address to default", async () => {
    const userId = await createUser();
    state.sessionUserId = userId;
    const [first, second] = await Promise.all([
      testDb.address.create({
        data: {
          userId,
          label: "Home",
          line1: "1 Rue A",
          city: "Lyon",
          postalCode: "69001",
          country: "France",
          isDefault: true,
        },
        select: { id: true },
      }),
      testDb.address.create({
        data: {
          userId,
          label: "Studio",
          line1: "2 Rue B",
          city: "Paris",
          postalCode: "75001",
          country: "France",
        },
        select: { id: true },
      }),
    ]);

    const form = addressForm({
      id: second.id,
      label: "Studio",
      line1: "2 Rue B",
      city: "Paris",
      postalCode: "75002",
      country: "France",
    });
    form.set("isDefault", "on");

    await expect(updateAddress(initial, form)).resolves.toEqual({
      error: null,
      ok: true,
    });

    const addresses = await testDb.address.findMany({
      where: { userId },
      orderBy: { label: "asc" },
    });
    expect(addresses.map((address) => [address.label, address.isDefault])).toEqual(
      [
        ["Home", false],
        ["Studio", true],
      ],
    );
    expect(addresses[1]?.postalCode).toBe("75002");
    expect(addresses[0]?.id).toBe(first.id);
  });

  it("keeps the existing default when the checkbox is absent", async () => {
    const userId = await createUser();
    state.sessionUserId = userId;
    const address = await testDb.address.create({
      data: {
        userId,
        label: "Home",
        line1: "1 Rue A",
        city: "Lyon",
        postalCode: "69001",
        country: "France",
        isDefault: true,
      },
      select: { id: true },
    });

    const form = addressForm({ id: address.id, city: "Grenoble" });
    await expect(updateAddress(initial, form)).resolves.toEqual({
      error: null,
      ok: true,
    });

    const after = await testDb.address.findUniqueOrThrow({
      where: { id: address.id },
    });
    expect(after).toMatchObject({ city: "Grenoble", isDefault: true });
  });
});

describe("setDefaultAddress", () => {
  it("moves the default to one of the customer's addresses", async () => {
    const userId = await createUser();
    state.sessionUserId = userId;
    await testDb.address.create({
      data: {
        userId,
        label: "Home",
        line1: "1 Rue A",
        city: "Lyon",
        postalCode: "69001",
        country: "France",
        isDefault: true,
      },
    });
    const studio = await testDb.address.create({
      data: {
        userId,
        label: "Studio",
        line1: "2 Rue B",
        city: "Paris",
        postalCode: "75001",
        country: "France",
      },
      select: { id: true },
    });

    const form = new FormData();
    form.set("id", studio.id);
    await setDefaultAddress(form);

    const addresses = await testDb.address.findMany({
      where: { userId },
      orderBy: { label: "asc" },
    });
    expect(addresses.map((address) => [address.label, address.isDefault])).toEqual(
      [
        ["Home", false],
        ["Studio", true],
      ],
    );
    expect(state.revalidated).toContain("/account/addresses");
  });

  it("is a no-op for an address that is not the customer's", async () => {
    const userId = await createUser();
    state.sessionUserId = userId;
    await testDb.address.create({
      data: {
        userId,
        label: "Home",
        line1: "1 Rue A",
        city: "Lyon",
        postalCode: "69001",
        country: "France",
        isDefault: true,
      },
    });

    const form = new FormData();
    form.set("id", randomUUID());
    await setDefaultAddress(form);

    const addresses = await testDb.address.findMany({ where: { userId } });
    expect(addresses.map((address) => address.isDefault)).toEqual([true]);
  });
});

describe("deleteAddress", () => {
  it("reports unknown addresses and refuses to delete the only one", async () => {
    const userId = await createUser();
    state.sessionUserId = userId;
    const only = await testDb.address.create({
      data: {
        userId,
        label: "Home",
        line1: "1 Rue A",
        city: "Lyon",
        postalCode: "69001",
        country: "France",
        isDefault: true,
      },
      select: { id: true },
    });

    const missing = new FormData();
    missing.set("id", randomUUID());
    await expect(deleteAddress(initial, missing)).resolves.toEqual({
      error: "That address no longer exists.",
      ok: false,
    });

    const form = new FormData();
    form.set("id", only.id);
    await expect(deleteAddress(initial, form)).resolves.toEqual({
      error: "You cannot delete your only address. Add another address first.",
      ok: false,
    });
    expect(await testDb.address.count()).toBe(1);
  });

  it("deletes a non-default address and leaves the default in place", async () => {
    const userId = await createUser();
    state.sessionUserId = userId;
    await testDb.address.create({
      data: {
        userId,
        label: "Home",
        line1: "1 Rue A",
        city: "Lyon",
        postalCode: "69001",
        country: "France",
        isDefault: true,
      },
    });
    const studio = await testDb.address.create({
      data: {
        userId,
        label: "Studio",
        line1: "2 Rue B",
        city: "Paris",
        postalCode: "75001",
        country: "France",
      },
      select: { id: true },
    });

    const form = new FormData();
    form.set("id", studio.id);
    await expect(deleteAddress(initial, form)).resolves.toEqual({
      error: null,
      ok: true,
    });

    const addresses = await testDb.address.findMany({ where: { userId } });
    expect(addresses.map((address) => [address.label, address.isDefault])).toEqual(
      [["Home", true]],
    );
  });

  it("promotes a fallback when the default address is deleted", async () => {
    const userId = await createUser();
    state.sessionUserId = userId;
    const home = await testDb.address.create({
      data: {
        userId,
        label: "Home",
        line1: "1 Rue A",
        city: "Lyon",
        postalCode: "69001",
        country: "France",
        isDefault: true,
      },
      select: { id: true },
    });
    await testDb.address.create({
      data: {
        userId,
        label: "Work",
        line1: "2 Rue B",
        city: "Paris",
        postalCode: "75001",
        country: "France",
      },
    });

    const form = new FormData();
    form.set("id", home.id);
    await expect(deleteAddress(initial, form)).resolves.toEqual({
      error: null,
      ok: true,
    });

    const addresses = await testDb.address.findMany({ where: { userId } });
    expect(addresses.map((address) => [address.label, address.isDefault])).toEqual(
      [["Work", true]],
    );
    expect(state.revalidated).toContain("/checkout");
  });
});
