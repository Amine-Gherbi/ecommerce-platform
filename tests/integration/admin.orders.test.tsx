import { execSync } from "node:child_process";

import { renderToStaticMarkup } from "react-dom/server";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { OrderTable } from "@/app/admin/orders/order-table";
import { setProductArchived } from "@/lib/admin";
import { getProductBySlug } from "@/lib/catalog";
import { db } from "@/lib/db";
import { formatCents } from "@/lib/format";
import { listOrdersForAdmin } from "@/lib/orders";

import {
  cleanupFixture,
  createCatalog,
  createPendingOrder,
  createUsers,
  runMigrations,
  type CatalogFixture,
} from "./helpers/fixtures";

// The admin console is read-only plus the archive toggle. Two claims to pin:
//   1. The seeded database contains a REFUND_REQUIRED order, and the order
//      list renders it with the state machine visible.
//   2. Archiving a product does not change what an order says was bought:
//      OrderItem snapshots still render after `archivedAt` is set.

let catalog: CatalogFixture;
let userId: string;
let orderId: string;

beforeAll(async () => {
  runMigrations();
  // Re-seed the test database exactly as the demo database is seeded. The
  // seed's own self-checks assert the REFUND_REQUIRED example exists.
  execSync("node --import tsx prisma/seed.ts --seed 42", {
    cwd: process.cwd(),
    env: process.env,
    stdio: "pipe",
    timeout: 110_000,
  });

  catalog = await createCatalog({
    stock: 5,
    priceCents: 8_000,
    label: "admin-archive",
  });
  const users = await createUsers("admin-archive", 1);
  const first = users[0];
  if (first === undefined) {
    throw new Error("no user fixture");
  }
  userId = first;

  const pending = await createPendingOrder(userId, catalog.variantId, 2);
  orderId = pending.orderId;
  await db.order.update({ where: { id: orderId }, data: { status: "PAID" } });
}, 120_000);

afterAll(async () => {
  await cleanupFixture({ userIds: [userId], catalogs: [catalog] });
  await db.$disconnect();
});

describe("admin orders", () => {
  it("renders the seeded REFUND_REQUIRED example with its next transition", async () => {
    const orders = await listOrdersForAdmin();
    const refundRequired = orders.filter(
      (order) => order.status === "REFUND_REQUIRED",
    );

    expect(refundRequired.length).toBeGreaterThanOrEqual(1);
    const example = refundRequired[0];
    if (example === undefined) {
      throw new Error("no REFUND_REQUIRED order");
    }
    expect(example.items.length).toBeGreaterThan(0);
    expect(example.nextStatuses).toEqual(["REFUNDED"]);

    const html = renderToStaticMarkup(<OrderTable orders={orders} />);

    expect(html).toContain("REFUND_REQUIRED");
    expect(html).toContain("Allowed next:");
    expect(html).toContain("REFUNDED");
    const firstItem = example.items[0];
    if (firstItem === undefined) {
      throw new Error("REFUND_REQUIRED order has no items");
    }
    expect(html).toContain(firstItem.sku);
    expect(html).toContain(firstItem.nameSnapshot);
    expect(html).toContain(formatCents(firstItem.unitPriceCents));
  }, 60_000);

  it("keeps OrderItem snapshots after the product is archived", async () => {
    const before = await db.orderItem.findMany({
      where: { orderId },
      select: {
        sku: true,
        nameSnapshot: true,
        unitPriceCents: true,
        quantity: true,
      },
    });
    expect(before).toHaveLength(1);
    const snapshot = before[0];
    if (snapshot === undefined) {
      throw new Error("order has no items");
    }

    const beforeProduct = await db.product.findUnique({
      where: { id: catalog.productId },
      select: { slug: true },
    });
    expect(beforeProduct?.slug).toBeDefined();

    expect(await setProductArchived(catalog.productId, true)).toBe(true);

    const product = await db.product.findUnique({
      where: { id: catalog.productId },
      select: { archivedAt: true },
    });
    expect(product?.archivedAt).not.toBeNull();

    const variant = await db.variant.findUnique({
      where: { id: catalog.variantId },
      select: { archivedAt: true },
    });
    expect(variant?.archivedAt).not.toBeNull();

    // The storefront hides the product; history does not.
    expect(
      await getProductBySlug(beforeProduct?.slug ?? "missing"),
    ).toBeNull();

    const order = (await listOrdersForAdmin()).find(
      (candidate) => candidate.id === orderId,
    );
    expect(order).toBeDefined();
    expect(order?.items).toHaveLength(1);

    const item = order?.items[0];
    expect(item?.sku).toBe(snapshot.sku);
    expect(item?.nameSnapshot).toBe(snapshot.nameSnapshot);
    expect(item?.unitPriceCents).toBe(snapshot.unitPriceCents);
    expect(item?.quantity).toBe(snapshot.quantity);
    expect(item?.variantArchivedAt).not.toBeNull();

    const html = renderToStaticMarkup(<OrderTable orders={order ? [order] : []} />);
    expect(html).toContain(snapshot.sku);
    expect(html).toContain(snapshot.nameSnapshot);
    expect(html).toContain(formatCents(snapshot.unitPriceCents));
    expect(html).toContain("(product archived)");
    expect(html).toContain("PAID");
  }, 60_000);
});
