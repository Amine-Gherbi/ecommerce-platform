"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { requireAdmin } from "@/lib/admin";
import { transitionOrder } from "@/lib/admin-orders";

// The only path to an order status change in the admin console. The role check
// runs before the transition, and the transition itself is a compare-and-set
// against the status the operator saw.
export async function transitionOrderAction(formData: FormData): Promise<void> {
  const actorId = await requireAdmin("/admin/orders");

  const orderId = String(formData.get("orderId") ?? "");
  const target = String(formData.get("target") ?? "");

  const result = await transitionOrder({ orderId, target, actorId });

  if (!result.ok) {
    const message = encodeURIComponent(result.message);
    if (result.reason === "illegal") {
      redirect(`/admin/orders/${encodeURIComponent(result.number)}?error=${message}`);
    }
    redirect(`/admin/orders?error=${message}`);
  }

  revalidatePath("/admin");
  revalidatePath("/admin/orders");
  revalidatePath(`/admin/orders/${result.number}`);
  revalidatePath(`/account/orders/${result.number}`);

  redirect(
    `/admin/orders/${encodeURIComponent(result.number)}?updated=${encodeURIComponent(result.status)}`,
  );
}
