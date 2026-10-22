import { randomUUID } from "node:crypto";

import { cookies } from "next/headers";

import { db } from "@/lib/db";
import { chargeableQuantity, computeTotals, type Totals } from "@/lib/pricing";

// Carts live in Postgres. Anonymous identity lives in one httpOnly cookie whose
// value is a random UUID that is also the `Cart.id`.
//
// Mutations always push `Cart.expiresAt` and the cookie's Max-Age 30 days into
// the future ("extended on every mutation"). Sign-in merges the anonymous cart
// inside a single transaction and then deletes the source row; deleting the
// source is what makes a second merge a no-op — there is no separate guard flag
// to get out of sync.

export const CART_COOKIE_NAME = "cart_id";
export const CART_TTL_DAYS = 30;

const CART_TTL_MS = CART_TTL_DAYS * 24 * 60 * 60 * 1_000;
const CART_TTL_SECONDS = CART_TTL_DAYS * 24 * 60 * 60;

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function isUuid(value: string): boolean {
  return UUID_RE.test(value);
}

function cartExpiry(): Date {
  return new Date(Date.now() + CART_TTL_MS);
}

export interface CartItemView {
  id: string;
  variantId: string;
  sku: string;
  productSlug: string;
  productName: string;
  variantName: string;
  unitPriceCents: number;
  quantity: number;
  stock: number;
  lineTotalCents: number;
}

export interface CartView {
  id: string | null;
  items: CartItemView[];
  totals: Totals;
}

export type MergeReason =
  | "missing"
  | "expired"
  | "foreign"
  | "already-merged";

export interface MergeResult {
  merged: boolean;
  sourceCartId: string;
  targetCartId: string | null;
  itemsMerged: number;
  reason?: MergeReason;
}

export function emptyCart(): CartView {
  return { id: null, items: [], totals: computeTotals([]) };
}

// ---------------------------------------------------------------------------
// Cookie helpers (Node runtime only; `cookies()` needs a request context).
// ---------------------------------------------------------------------------

export async function readCartCookie(): Promise<string | null> {
  const jar = await cookies();
  return jar.get(CART_COOKIE_NAME)?.value ?? null;
}

export async function writeCartCookie(cartId: string): Promise<void> {
  const jar = await cookies();
  jar.set(CART_COOKIE_NAME, cartId, {
    httpOnly: true,
    secure: true,
    sameSite: "lax",
    path: "/",
    maxAge: CART_TTL_SECONDS,
  });
}

export async function clearCartCookie(): Promise<void> {
  const jar = await cookies();
  jar.delete(CART_COOKIE_NAME);
}

// ---------------------------------------------------------------------------
// Reads
// ---------------------------------------------------------------------------

export async function loadCart(cartId: string): Promise<CartView | null> {
  if (!isUuid(cartId)) {
    return null;
  }

  const cart = await db.cart.findUnique({
    where: { id: cartId },
    include: {
      items: {
        orderBy: { createdAt: "asc" },
        include: {
          variant: {
            include: {
              product: { select: { name: true, slug: true } },
            },
          },
        },
      },
    },
  });

  if (cart === null || cart.expiresAt.getTime() <= Date.now()) {
    return null;
  }

  const items: CartItemView[] = cart.items.map((item) => {
    const quantity = chargeableQuantity({
      unitPriceCents: item.variant.priceCents,
      quantity: item.quantity,
      availableStock: item.variant.stock,
    });
    return {
      id: item.id,
      variantId: item.variantId,
      sku: item.variant.sku,
      productSlug: item.variant.product.slug,
      productName: item.variant.product.name,
      variantName: item.variant.name,
      unitPriceCents: item.variant.priceCents,
      quantity: item.quantity,
      stock: item.variant.stock,
      lineTotalCents: item.variant.priceCents * quantity,
    };
  });

  return {
    id: cart.id,
    items,
    totals: computeTotals(
      items.map((item) => ({
        unitPriceCents: item.unitPriceCents,
        quantity: item.quantity,
        availableStock: item.stock,
      })),
    ),
  };
}

/** The signed-in user's active cart, or the anonymous cookie's cart. */
export async function getCurrentCart(
  userId: string | null = null,
): Promise<CartView> {
  if (userId !== null) {
    const cart = await db.cart.findFirst({
      where: { userId, expiresAt: { gt: new Date() } },
      orderBy: { createdAt: "desc" },
      select: { id: true },
    });
    return cart === null ? emptyCart() : (await loadCart(cart.id)) ?? emptyCart();
  }

  const cookieId = await readCartCookie();
  if (cookieId === null) {
    return emptyCart();
  }
  return (await loadCart(cookieId)) ?? emptyCart();
}

// ---------------------------------------------------------------------------
// Writes
// ---------------------------------------------------------------------------

async function touchCart(cartId: string): Promise<void> {
  await db.cart.update({
    where: { id: cartId },
    data: { expiresAt: cartExpiry() },
  });
  await writeCartCookie(cartId);
}

/**
 * Returns the cart a mutation should write to, creating it if needed.
 *
 * Signed-in users are keyed by `Cart.userId`; anonymous users by the cookie.
 * A stale cookie (cart row gone, expired, or already owned by a user) is
 * replaced rather than reused.
 */
export async function getOrCreateCartId(
  userId: string | null = null,
): Promise<string> {
  if (userId !== null) {
    const existing = await db.cart.findFirst({
      where: { userId, expiresAt: { gt: new Date() } },
      orderBy: { createdAt: "desc" },
      select: { id: true },
    });
    if (existing !== null) {
      return existing.id;
    }
    const id = randomUUID();
    await db.cart.create({
      data: { id, userId, expiresAt: cartExpiry() },
    });
    return id;
  }

  const cookieId = await readCartCookie();
  if (cookieId !== null && isUuid(cookieId)) {
    const existing = await db.cart.findUnique({
      where: { id: cookieId },
      select: { id: true, userId: true, expiresAt: true },
    });
    if (
      existing !== null &&
      existing.userId === null &&
      existing.expiresAt.getTime() > Date.now()
    ) {
      return existing.id;
    }
  }

  const id = randomUUID();
  await db.cart.create({ data: { id, userId: null, expiresAt: cartExpiry() } });
  await writeCartCookie(id);
  return id;
}

/**
 * Adds `quantity` to a line, clamped so the stored quantity never exceeds
 * `Variant.stock`. The clamp lives in SQL so two concurrent adds cannot read
 * the same stock and both overshoot.
 */
export async function addCartLine(
  cartId: string,
  variantId: string,
  quantity: number,
): Promise<CartView> {
  if (!Number.isSafeInteger(quantity) || quantity <= 0) {
    throw new RangeError(`quantity must be a positive integer, received ${String(quantity)}`);
  }

  await db.$executeRaw`
    INSERT INTO "CartItem" ("id", "cartId", "variantId", "quantity", "createdAt", "updatedAt")
    SELECT gen_random_uuid(), ${cartId}::uuid, v.id,
           LEAST(${quantity}::int, v.stock), now(), now()
    FROM "Variant" v
    WHERE v.id = ${variantId}::uuid
      AND v."archivedAt" IS NULL
      AND v.stock > 0
    ON CONFLICT ("cartId", "variantId") DO UPDATE
    SET "quantity" = LEAST(
          "CartItem"."quantity" + EXCLUDED."quantity",
          (SELECT stock FROM "Variant" WHERE id = EXCLUDED."variantId")
        ),
        "updatedAt" = now()
  `;

  await touchCart(cartId);
  return (await loadCart(cartId)) ?? emptyCart();
}

/**
 * Sets a line to an exact quantity. `0` removes the line. Positive values are
 * clamped to stock; a line whose variant has run out is removed.
 */
export async function setCartLineQuantity(
  cartId: string,
  variantId: string,
  quantity: number,
): Promise<CartView> {
  if (!Number.isSafeInteger(quantity) || quantity < 0) {
    throw new RangeError(`quantity must be a non-negative integer, received ${String(quantity)}`);
  }

  if (quantity === 0) {
    return removeCartLine(cartId, variantId);
  }

  await db.$executeRaw`
    UPDATE "CartItem"
    SET "quantity" = LEAST(
          ${quantity}::int,
          (SELECT stock FROM "Variant" WHERE id = ${variantId}::uuid)
        ),
        "updatedAt" = now()
    WHERE "cartId" = ${cartId}::uuid
      AND "variantId" = ${variantId}::uuid
      AND EXISTS (
        SELECT 1 FROM "Variant"
        WHERE id = ${variantId}::uuid AND stock > 0
      )
  `;

  // Stock may have hit zero since the line was added; drop the line rather
  // than leaving an unorderable row behind.
  await db.$executeRaw`
    DELETE FROM "CartItem"
    WHERE "cartId" = ${cartId}::uuid
      AND "variantId" = ${variantId}::uuid
      AND NOT EXISTS (
        SELECT 1 FROM "Variant"
        WHERE id = ${variantId}::uuid AND stock > 0
      )
  `;

  await touchCart(cartId);
  return (await loadCart(cartId)) ?? emptyCart();
}

export async function removeCartLine(
  cartId: string,
  variantId: string,
): Promise<CartView> {
  await db.$executeRaw`
    DELETE FROM "CartItem"
    WHERE "cartId" = ${cartId}::uuid AND "variantId" = ${variantId}::uuid
  `;
  await touchCart(cartId);
  return (await loadCart(cartId)) ?? emptyCart();
}

// ---------------------------------------------------------------------------
// Sign-in merge
// ---------------------------------------------------------------------------

/**
 * Merges an anonymous cart into the user's cart in one transaction.
 *
 * 1. `SELECT ... FOR UPDATE` on the source cart. A concurrent sign-in with the
 *    same cookie blocks here; after the first commit the row is gone, so the
 *    second transaction sees nothing and returns `missing`.
 * 2. Find or create the user's target cart.
 * 3. Insert every source line with `LEAST(quantity, stock)`; on conflict add the
 *    quantities and clamp the sum to stock.
 * 4. Delete the source cart (items cascade).
 *
 * Idempotency comes from step 4: the source no longer exists, so replaying the
 * merge is a no-op without any additional guard.
 */
export async function mergeAnonymousCart(
  userId: string,
  sourceCartId: string,
): Promise<MergeResult> {
  if (!isUuid(userId) || !isUuid(sourceCartId)) {
    throw new RangeError("mergeAnonymousCart expects UUIDs");
  }

  return db.$transaction(async (tx) => {
    const sources = await tx.$queryRaw<
      Array<{ id: string; userId: string | null; expiresAt: Date }>
    >`
      SELECT id, "userId", "expiresAt"
      FROM "Cart"
      WHERE id = ${sourceCartId}::uuid
      FOR UPDATE
    `;

    const source = sources[0];
    if (source === undefined) {
      return {
        merged: false,
        sourceCartId,
        targetCartId: null,
        itemsMerged: 0,
        reason: "missing",
      } satisfies MergeResult;
    }

    if (source.userId !== null) {
      return {
        merged: false,
        sourceCartId,
        targetCartId: null,
        itemsMerged: 0,
        reason: source.userId === userId ? "already-merged" : "foreign",
      } satisfies MergeResult;
    }

    if (source.expiresAt.getTime() <= Date.now()) {
      await tx.$executeRaw`DELETE FROM "Cart" WHERE id = ${sourceCartId}::uuid`;
      return {
        merged: false,
        sourceCartId,
        targetCartId: null,
        itemsMerged: 0,
        reason: "expired",
      } satisfies MergeResult;
    }

    const targets = await tx.$queryRaw<Array<{ id: string }>>`
      SELECT id
      FROM "Cart"
      WHERE "userId" = ${userId}::uuid
        AND id <> ${sourceCartId}::uuid
        AND "expiresAt" > now()
      ORDER BY "createdAt" DESC
      LIMIT 1
    `;

    let targetCartId = targets[0]?.id;
    if (targetCartId === undefined) {
      targetCartId = randomUUID();
      await tx.cart.create({
        data: { id: targetCartId, userId, expiresAt: cartExpiry() },
      });
    }

    const itemsMerged = await tx.$executeRaw`
      INSERT INTO "CartItem" ("id", "cartId", "variantId", "quantity", "createdAt", "updatedAt")
      SELECT gen_random_uuid(), ${targetCartId}::uuid, ci."variantId",
             LEAST(ci."quantity", v.stock), now(), now()
      FROM "CartItem" ci
      JOIN "Variant" v ON v.id = ci."variantId"
      WHERE ci."cartId" = ${sourceCartId}::uuid
        AND ci."quantity" > 0
        AND v.stock > 0
      ON CONFLICT ("cartId", "variantId") DO UPDATE
      SET "quantity" = LEAST(
            "CartItem"."quantity" + EXCLUDED."quantity",
            (SELECT stock FROM "Variant" WHERE id = EXCLUDED."variantId")
          ),
          "updatedAt" = now()
    `;

    await tx.cart.update({
      where: { id: targetCartId },
      data: { expiresAt: cartExpiry() },
    });

    await tx.$executeRaw`DELETE FROM "Cart" WHERE id = ${sourceCartId}::uuid`;

    return {
      merged: true,
      sourceCartId,
      targetCartId,
      itemsMerged,
    } satisfies MergeResult;
  });
}

/**
 * Sign-in hook: merges the cookie's anonymous cart, then clears the cookie on
 * the same response. If the merge throws, the cookie is deliberately left in
 * place so the next sign-in can retry without losing the cart.
 */
export async function mergeCartOnSignIn(
  userId: string,
): Promise<MergeResult | null> {
  const sourceCartId = await readCartCookie();
  if (sourceCartId === null) {
    return null;
  }
  if (!isUuid(sourceCartId)) {
    await clearCartCookie();
    return null;
  }

  const result = await mergeAnonymousCart(userId, sourceCartId);
  await clearCartCookie();
  return result;
}
