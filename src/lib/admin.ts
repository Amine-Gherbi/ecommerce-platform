import { db } from "@/lib/db";

// Admin product maintenance: list and archive, nothing else.
//
// "Delete" is `archivedAt`, never a row delete. Variants are archived with
// their product so the catalog, the product page and checkout all agree the
// item is unavailable; order history keeps its own snapshots and is untouched
// (`OrderItem.variantId` is `ON DELETE SET NULL`, and the snapshots are the
// source of truth for what was bought).

export interface AdminProductView {
  id: string;
  slug: string;
  name: string;
  categoryName: string;
  variantCount: number;
  archivedAt: Date | null;
}

export async function listProductsForAdmin(
  limit = 100,
): Promise<AdminProductView[]> {
  const products = await db.product.findMany({
    orderBy: [{ archivedAt: "asc" }, { name: "asc" }],
    take: limit,
    select: {
      id: true,
      slug: true,
      name: true,
      archivedAt: true,
      category: { select: { name: true } },
      _count: { select: { variants: true } },
    },
  });

  return products.map((product) => ({
    id: product.id,
    slug: product.slug,
    name: product.name,
    categoryName: product.category.name,
    variantCount: product._count.variants,
    archivedAt: product.archivedAt,
  }));
}

/**
 * Archives or restores a product and every variant under it.
 *
 * Returns false when the product does not exist (a stale admin form); callers
 * treat that as a no-op rather than throwing.
 */
export async function setProductArchived(
  productId: string,
  archived: boolean,
): Promise<boolean> {
  return db.$transaction(
    async (tx) => {
      const product = await tx.product.findUnique({
        where: { id: productId },
        select: { id: true },
      });
      if (product === null) {
        console.warn(`[admin] product ${productId} not found; archive ignored`);
        return false;
      }

      const archivedAt = archived ? new Date() : null;
      await tx.product.update({
        where: { id: product.id },
        data: { archivedAt },
      });
      await tx.variant.updateMany({
        where: { productId: product.id },
        data: { archivedAt },
      });
      console.info(
        `[admin] product ${product.id} ${archived ? "archived" : "restored"}`,
      );
      return true;
    },
    { maxWait: 20_000, timeout: 20_000 },
  );
}
