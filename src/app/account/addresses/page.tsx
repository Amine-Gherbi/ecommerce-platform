import type { Metadata } from "next";

import { db } from "@/lib/db";
import { requireUserId } from "@/lib/session";
import {
  eyebrowClass,
  pageTitleClass,
  secondaryButtonClass,
} from "@/lib/styles";
import { cn } from "@/lib/utils";

import { addAddress, setDefaultAddress, updateAddress } from "./actions";
import { AddressForm, DeleteAddressForm } from "./address-forms";

export const metadata: Metadata = {
  title: "Addresses",
};

export default async function AddressesPage() {
  const userId = await requireUserId("/account/addresses");

  const addresses = await db.address.findMany({
    where: { userId },
    orderBy: [{ isDefault: "desc" }, { label: "asc" }],
  });

  return (
    <div>
      <h1 className={pageTitleClass}>Addresses</h1>
      <p className="mt-3 max-w-[60ch] text-[13px] leading-5 text-muted">
        Addresses are used at checkout. You need at least one; the default is
        selected automatically.
      </p>

      <details className="mt-8 border border-control">
        <summary className="px-4 py-3 text-[13px] leading-5 text-muted transition-colors hover:text-ink">
          Add an address
        </summary>
        <div className="border-t border-rule p-4 lg:p-6">
          <AddressForm action={addAddress} submitLabel="Add address" />
        </div>
      </details>

      {addresses.length === 0 ? (
        <p className="mt-8 border-t border-rule pt-8 text-[15px] leading-5 text-muted">
          No addresses yet. Use the form above to add the first one.
        </p>
      ) : (
        <ul className="mt-10 border-t border-rule">
          {addresses.map((address) => (
            <li key={address.id} className="border-b border-rule py-6">
              <div className="flex flex-wrap items-start justify-between gap-4">
                <div>
                  <div className="flex flex-wrap items-center gap-3">
                    <h2 className="text-[17px] leading-6 text-ink">
                      {address.label}
                    </h2>
                    {address.isDefault ? (
                      <span className="border border-control px-2 py-0.5 text-[11px] uppercase leading-4 tracking-[0.14em] text-muted">
                        Default
                      </span>
                    ) : null}
                  </div>

                  <address className="mt-2 not-italic text-[13px] leading-5 text-muted">
                    <p>{address.line1}</p>
                    {address.line2 !== null ? <p>{address.line2}</p> : null}
                    <p>
                      {address.city}, {address.postalCode}
                    </p>
                    <p>{address.country}</p>
                  </address>
                </div>

                <div className="flex flex-wrap items-center gap-x-5 gap-y-2">
                  {!address.isDefault ? (
                    <form action={setDefaultAddress}>
                      <input type="hidden" name="id" value={address.id} />
                      <button
                        type="submit"
                        className={cn(secondaryButtonClass, "h-9 px-4")}
                      >
                        Set as default
                      </button>
                    </form>
                  ) : null}
                  <DeleteAddressForm addressId={address.id} />
                </div>
              </div>

              <details className="mt-4 border border-control">
                <summary className="px-4 py-2.5 text-[13px] leading-5 text-muted transition-colors hover:text-ink">
                  Edit address
                </summary>
                <div className="border-t border-rule p-4">
                  <AddressForm
                    action={updateAddress}
                    initial={address}
                    submitLabel="Save address"
                  />
                </div>
              </details>
            </li>
          ))}
        </ul>
      )}

      <p className={cn(eyebrowClass, "mt-10")}>
        {addresses.length} {addresses.length === 1 ? "address" : "addresses"} on
        file
      </p>
    </div>
  );
}
