import { randomUUID } from "node:crypto";

import type { Prisma } from "@prisma/client";
import { cookies } from "next/headers";

import { auth } from "@/auth";
import { mergeCartQuantity } from "@/lib/cart-merge";
import { db } from "@/lib/db";
import {
  FREE_SHIPPING_THRESHOLD_CENTS,
  MAX_CART_QUANTITY,
  SHIPPING_CENTS,
  formatPrice,
  shippingRuleCopy,
} from "@/lib/money";

import type { ProductImageModel } from "./catalog";

const CART_COOKIE = "kestrel_cart";
const CART_COOKIE_MAX_AGE = 60 * 60 * 24 * 30;

const cartInclude = {
  items: {
    orderBy: { addedAt: "asc" },
    include: {
      variant: {
        include: {
          product: {
            include: {
              brand: { select: { name: true } },
              images: {
                orderBy: { position: "asc" },
                take: 1,
                select: { url: true, alt: true },
              },
            },
          },
        },
      },
    },
  },
} satisfies Prisma.CartInclude;

type CartRecord = Prisma.CartGetPayload<{ include: typeof cartInclude }>;

export interface CartLineModel {
  id: string;
  variantId: string;
  productSlug: string;
  productTitle: string;
  brandName: string;
  variantTitle: string;
  quantity: number;
  unitPrice: string;
  lineTotal: string;
  image: ProductImageModel | null;
  inStock: boolean;
  maxQuantity: number;
}

export interface CartPageData {
  items: CartLineModel[];
  itemCount: number;
  subtotal: string;
  shipping: string;
  total: string;
  shippingRule: string;
  freeShippingThreshold: string;
}

async function currentUserId(): Promise<string | null> {
  const session = await auth();
  const userId = session?.user?.id;
  return typeof userId === "string" && userId.length > 0 ? userId : null;
}

async function readCartCookie(): Promise<string | null> {
  const store = await cookies();
  const value = store.get(CART_COOKIE)?.value;
  return value !== undefined && value.length > 0 ? value : null;
}

async function anonymousCart(): Promise<CartRecord | null> {
  const anonymousId = await readCartCookie();
  if (anonymousId === null) {
    return null;
  }

  return db.cart.findUnique({
    where: { anonymousId },
    include: cartInclude,
  });
}

function emptyCart(): CartPageData {
  return {
    items: [],
    itemCount: 0,
    subtotal: formatPrice(0),
    shipping: formatPrice(0),
    total: formatPrice(0),
    shippingRule: shippingRuleCopy(),
    freeShippingThreshold: formatPrice(FREE_SHIPPING_THRESHOLD_CENTS),
  };
}

function toCartLine(
  item: CartRecord["items"][number],
): CartLineModel {
  const { variant } = item;
  const { product } = variant;
  const lineTotalCents = variant.priceCents * item.quantity;

  return {
    id: item.id,
    variantId: variant.id,
    productSlug: product.slug,
    productTitle: product.title,
    brandName: product.brand.name,
    variantTitle: variant.title,
    quantity: item.quantity,
    unitPrice: formatPrice(variant.priceCents),
    lineTotal: formatPrice(lineTotalCents),
    image: product.images[0] ?? null,
    inStock: variant.stock > 0,
    maxQuantity: Math.min(variant.stock, MAX_CART_QUANTITY),
  };
}

function summarise(cart: CartRecord): CartPageData {
  const items = cart.items.map(toCartLine);
  const itemCount = items.reduce((sum, item) => sum + item.quantity, 0);
  const subtotalCents = cart.items.reduce(
    (sum, item) => sum + item.variant.priceCents * item.quantity,
    0,
  );
  const shippingCents =
    subtotalCents === 0 ||
    subtotalCents >= FREE_SHIPPING_THRESHOLD_CENTS
      ? 0
      : SHIPPING_CENTS;

  return {
    items,
    itemCount,
    subtotal: formatPrice(subtotalCents),
    shipping: shippingCents === 0 ? "Free" : formatPrice(shippingCents),
    total: formatPrice(subtotalCents + shippingCents),
    shippingRule: shippingRuleCopy(),
    freeShippingThreshold: formatPrice(FREE_SHIPPING_THRESHOLD_CENTS),
  };
}

export async function getCartData(): Promise<CartPageData> {
  const userId = await currentUserId();
  const cart =
    userId !== null
      ? await db.cart.findUnique({ where: { userId }, include: cartInclude })
      : await anonymousCart();

  return cart === null ? emptyCart() : summarise(cart);
}

export async function getCartCount(): Promise<number> {
  const userId = await currentUserId();
  const cart =
    userId !== null
      ? await db.cart.findUnique({
          where: { userId },
          select: { id: true },
        })
      : await (async () => {
          const anonymousId = await readCartCookie();
          if (anonymousId === null) {
            return null;
          }
          return db.cart.findUnique({
            where: { anonymousId },
            select: { id: true },
          });
        })();

  if (cart === null) {
    return 0;
  }

  const aggregate = await db.cartItem.aggregate({
    where: { cartId: cart.id },
    _sum: { quantity: true },
  });

  return aggregate._sum.quantity ?? 0;
}

export async function getCurrentCartId(): Promise<string | null> {
  const userId = await currentUserId();
  if (userId !== null) {
    const cart = await db.cart.findUnique({
      where: { userId },
      select: { id: true },
    });
    return cart?.id ?? null;
  }

  const anonymousId = await readCartCookie();
  if (anonymousId === null) {
    return null;
  }

  const cart = await db.cart.findUnique({
    where: { anonymousId },
    select: { id: true },
  });

  return cart?.id ?? null;
}

export async function getOrCreateCart(): Promise<{
  cartId: string;
  anonymousId: string | null;
}> {
  const userId = await currentUserId();
  if (userId !== null) {
    const cart = await db.cart.upsert({
      where: { userId },
      update: {},
      create: { userId },
      select: { id: true },
    });

    return { cartId: cart.id, anonymousId: null };
  }

  const store = await cookies();
  const current = store.get(CART_COOKIE)?.value;
  const anonymousId =
    current !== undefined && current.length > 0 ? current : randomUUID();

  const cart = await db.cart.upsert({
    where: { anonymousId },
    update: {},
    create: { anonymousId },
    select: { id: true },
  });

  store.set(CART_COOKIE, anonymousId, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: CART_COOKIE_MAX_AGE,
  });

  return { cartId: cart.id, anonymousId };
}

// Runs once after a successful sign-in (or sign-up). The anonymous cart row is
// deleted inside the same transaction as the copy, so replaying this call finds
// nothing to merge. Quantities follow `mergeCartQuantity`: higher wins.
export async function mergeAnonymousCartIntoUserCart(
  userId: string,
): Promise<void> {
  const store = await cookies();
  const anonymousId = store.get(CART_COOKIE)?.value;
  if (anonymousId === undefined || anonymousId.length === 0) {
    return;
  }

  await db.$transaction(async (tx) => {
    const source = await tx.cart.findUnique({
      where: { anonymousId },
      select: {
        id: true,
        userId: true,
        items: { select: { variantId: true, quantity: true } },
      },
    });

    if (source === null || source.userId !== null) {
      return;
    }

    const target = await tx.cart.upsert({
      where: { userId },
      update: {},
      create: { userId },
      select: { id: true },
    });

    for (const item of source.items) {
      const existing = await tx.cartItem.findUnique({
        where: {
          cartId_variantId: {
            cartId: target.id,
            variantId: item.variantId,
          },
        },
        select: { quantity: true },
      });

      const quantity = mergeCartQuantity(
        existing?.quantity ?? null,
        item.quantity,
      );

      await tx.cartItem.upsert({
        where: {
          cartId_variantId: {
            cartId: target.id,
            variantId: item.variantId,
          },
        },
        create: {
          cartId: target.id,
          variantId: item.variantId,
          quantity,
        },
        update: { quantity },
      });
    }

    await tx.cart.deleteMany({ where: { id: source.id, userId: null } });
  });

  store.delete(CART_COOKIE);
}
