// Customer-facing order reads. Every query is scoped by `userId` in the
// database, not filtered after the fact, so one customer's order number can
// never return another customer's receipt.

import type { Prisma } from "@prisma/client";

import { db } from "@/lib/db";

export const orderDetailInclude = {
  items: { orderBy: { sku: "asc" } },
} satisfies Prisma.OrderInclude;

export async function findOrderForCustomer(
  number: string,
  userId: string,
): Promise<Prisma.OrderGetPayload<{
  include: typeof orderDetailInclude;
}> | null> {
  return db.order.findFirst({
    where: { number, userId },
    include: orderDetailInclude,
  });
}
