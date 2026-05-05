import { randomUUID } from "node:crypto";

import type { Prisma } from "@prisma/client";
import { cookies } from "next/headers";

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

async function readCartCookie(): Promise<string | null> {
  const store = await cookies();
  const value = store.get(CART_COOKIE)?.value;
  return value !== undefined && value.length > 0 ? value : null;
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

export async function getCartData(): Promise<CartPageData> {
  const anonymousId = await readCartCookie();
  if (anonymousId === null) {
    return emptyCart();
  }

  const cart = await db.cart.findUnique({
    where: { anonymousId },
    include: cartInclude,
  });
  if (cart === null) {
    return emptyCart();
  }

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

export async function getCartCount(): Promise<number> {
  const anonymousId = await readCartCookie();
  if (anonymousId === null) {
    return 0;
  }

  const cart = await db.cart.findUnique({
    where: { anonymousId },
    select: { id: true },
  });
  if (cart === null) {
    return 0;
  }

  const aggregate = await db.cartItem.aggregate({
    where: { cartId: cart.id },
    _sum: { quantity: true },
  });

  return aggregate._sum.quantity ?? 0;
}

export async function getCartIdForCookie(): Promise<string | null> {
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
  anonymousId: string;
}> {
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
