import { createHash } from "node:crypto";

import { hash } from "@node-rs/argon2";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

// Fixed epoch for seed ids: 2026-01-01T00:00:00Z. Deterministic UUIDv7 shape,
// derived from a counter plus a hash salt — no randomness, no database sequences.
const UUID_EPOCH_MS = 1_767_225_600_000n;

function deterministicUuid7(seq: number, salt: string): string {
  const timestamp = (UUID_EPOCH_MS + BigInt(seq)).toString(16).padStart(12, "0");
  const hash = createHash("sha256").update(salt).digest("hex");
  const randA = hash.slice(0, 3);
  const variantNibble = ((parseInt(hash[3] ?? "0", 16) & 0x3) | 0x8).toString(16);
  const randB = hash.slice(4, 19);
  const hex = `${timestamp}7${randA}${variantNibble}${randB}`;
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20, 32)}`;
}

interface ProductSpec {
  slug: string;
  name: string;
  description: string;
  categorySlug: string;
  variantLabels: string[];
}

const CATEGORIES = [
  { slug: "apparel", name: "Apparel" },
  { slug: "footwear", name: "Footwear" },
  { slug: "accessories", name: "Accessories" },
  { slug: "home", name: "Home" },
  { slug: "stationery", name: "Stationery" },
] as const;

// 40 products, 8 per category. Slugs are part of the seed contract.
const PRODUCTS: ProductSpec[] = [
  { slug: "alder-canvas-jacket", name: "Alder Canvas Jacket", description: "A heavyweight cotton canvas jacket with a brushed flannel lining. Water resistant and built for cold mornings.", categorySlug: "apparel", variantLabels: ["S", "M", "L"] },
  { slug: "birch-merino-sweater", name: "Birch Merino Sweater", description: "Fine merino wool sweater, knitted in a rib pattern. Warm, breathable and machine washable.", categorySlug: "apparel", variantLabels: ["S", "M", "L"] },
  { slug: "cedar-oxford-shirt", name: "Cedar Oxford Shirt", description: "A cotton oxford shirt with a soft button-down collar. Cut for everyday wear.", categorySlug: "apparel", variantLabels: ["S", "M", "L"] },
  { slug: "dune-linen-trousers", name: "Dune Linen Trousers", description: "Relaxed linen trousers with a drawstring waist. Light enough for summer travel.", categorySlug: "apparel", variantLabels: ["S", "M", "L"] },
  { slug: "elm-heavy-hoodie", name: "Elm Heavy Hoodie", description: "Loopback cotton fleece hoodie with a double-layer hood and reinforced pockets.", categorySlug: "apparel", variantLabels: ["S", "M", "L"] },
  { slug: "fern-rain-shell", name: "Fern Rain Shell", description: "A packable waterproof rain shell with taped seams and a storm hood.", categorySlug: "apparel", variantLabels: ["S", "M", "L"] },
  { slug: "grove-denim-jacket", name: "Grove Denim Jacket", description: "Rigid denim jacket in a classic trucker cut, softened with a stone wash.", categorySlug: "apparel", variantLabels: ["S", "M", "L"] },
  { slug: "harbor-crew-tee", name: "Harbor Crew Tee", description: "Heavyweight organic cotton tee with a ribbed crew neck that keeps its shape.", categorySlug: "apparel", variantLabels: ["S", "M", "L"] },

  { slug: "alpine-trail-runner", name: "Alpine Trail Runner", description: "A trail running shoe with a sticky rubber outsole and a rock plate for technical ground.", categorySlug: "footwear", variantLabels: ["8", "9", "10"] },
  { slug: "bayside-canvas-sneaker", name: "Bayside Canvas Sneaker", description: "Low-top canvas sneaker with a vulcanised rubber sole and cotton laces.", categorySlug: "footwear", variantLabels: ["8", "9", "10"] },
  { slug: "cobble-leather-boot", name: "Cobble Leather Boot", description: "Full-grain leather boot with a Goodyear welt and a lugged commando sole.", categorySlug: "footwear", variantLabels: ["8", "9", "10"] },
  { slug: "drift-sandal", name: "Drift Sandal", description: "A moulded-footbed summer sandal with adjustable webbing straps.", categorySlug: "footwear", variantLabels: ["8", "9", "10"] },
  { slug: "ember-hiking-boot", name: "Ember Hiking Boot", description: "Waterproof hiking boot with a padded collar and a Vibram outsole.", categorySlug: "footwear", variantLabels: ["8", "9", "10"] },
  { slug: "fjord-rain-boot", name: "Fjord Rain Boot", description: "Natural rubber rain boot with a neoprene lining and a grippy tread.", categorySlug: "footwear", variantLabels: ["8", "9", "10"] },
  { slug: "granite-approach-shoe", name: "Granite Approach Shoe", description: "An approach shoe with a climbing-zone rubber toe and a stiff midsole.", categorySlug: "footwear", variantLabels: ["8", "9", "10"] },
  { slug: "harbor-deck-shoe", name: "Harbor Deck Shoe", description: "Hand-stitched leather deck shoe with a non-marking siped sole.", categorySlug: "footwear", variantLabels: ["8", "9", "10"] },

  { slug: "alder-canvas-backpack", name: "Alder Canvas Backpack", description: "A waxed canvas backpack with a padded laptop sleeve and leather straps. Twenty litres, built for the commute.", categorySlug: "accessories", variantLabels: ["One Size", "Large"] },
  { slug: "birch-leather-belt", name: "Birch Leather Belt", description: "Vegetable-tanned leather belt with a solid brass buckle, cut to length.", categorySlug: "accessories", variantLabels: ["Medium", "Large"] },
  { slug: "cedar-wool-scarf", name: "Cedar Wool Scarf", description: "A soft lambswool scarf woven in a herringbone pattern.", categorySlug: "accessories", variantLabels: ["One Size", "Large"] },
  { slug: "dune-sunglasses", name: "Dune Sunglasses", description: "Acetate sunglasses with polarised lenses and a compact travel case.", categorySlug: "accessories", variantLabels: ["One Size", "Large"] },
  { slug: "elm-travel-wallet", name: "Elm Travel Wallet", description: "A slim leather travel wallet for passports, cards and boarding passes.", categorySlug: "accessories", variantLabels: ["One Size", "Large"] },
  { slug: "fern-knit-beanie", name: "Fern Knit Beanie", description: "A rib-knit merino beanie with a folded cuff.", categorySlug: "accessories", variantLabels: ["One Size", "Large"] },
  { slug: "grove-tote-bag", name: "Grove Tote Bag", description: "A sturdy canvas tote with an interior pocket and reinforced handles.", categorySlug: "accessories", variantLabels: ["One Size", "Large"] },
  { slug: "harbor-weekender-duffel", name: "Harbor Weekender Duffel", description: "A waxed canvas duffel with leather trim, a shoe compartment and a shoulder strap.", categorySlug: "accessories", variantLabels: ["One Size", "Large"] },

  { slug: "alder-ceramic-mug", name: "Alder Ceramic Mug", description: "A stoneware mug with a speckled glaze, dishwasher and microwave safe.", categorySlug: "home", variantLabels: ["Standard", "Large"] },
  { slug: "birch-cutting-board", name: "Birch Cutting Board", description: "An end-grain birch cutting board with a juice groove and finger grips.", categorySlug: "home", variantLabels: ["Standard", "Large"] },
  { slug: "cedar-throw-blanket", name: "Cedar Throw Blanket", description: "A wool throw blanket with a herringbone weave and hand-knotted fringe.", categorySlug: "home", variantLabels: ["Standard", "Large"] },
  { slug: "dune-table-lamp", name: "Dune Table Lamp", description: "A ceramic table lamp with a linen shade and a dimmable warm bulb.", categorySlug: "home", variantLabels: ["Standard", "Large"] },
  { slug: "elm-storage-basket", name: "Elm Storage Basket", description: "A woven storage basket in sea grass with leather handles.", categorySlug: "home", variantLabels: ["Standard", "Large"] },
  { slug: "fern-cotton-towel", name: "Fern Cotton Towel", description: "A heavyweight cotton towel woven in a waffle texture that dries quickly.", categorySlug: "home", variantLabels: ["Standard", "Large"] },
  { slug: "grove-candle", name: "Grove Candle", description: "A soy wax candle with cedar and moss notes, poured in a reusable glass jar.", categorySlug: "home", variantLabels: ["Standard", "Large"] },
  { slug: "harbor-wall-clock", name: "Harbor Wall Clock", description: "A silent wall clock with a solid oak face and a matte black rim.", categorySlug: "home", variantLabels: ["Standard", "Large"] },

  { slug: "alder-notebook", name: "Alder Notebook", description: "A thread-bound notebook with 160 pages of dot-grid paper and a lay-flat spine.", categorySlug: "stationery", variantLabels: ["A5", "A4"] },
  { slug: "birch-fountain-pen", name: "Birch Fountain Pen", description: "A brass fountain pen with a fine steel nib and a converter for bottled ink.", categorySlug: "stationery", variantLabels: ["Fine", "Medium"] },
  { slug: "cedar-desk-tray", name: "Cedar Desk Tray", description: "A felt-lined oak desk tray for pens, cards and a phone.", categorySlug: "stationery", variantLabels: ["Standard", "Large"] },
  { slug: "dune-weekly-planner", name: "Dune Weekly Planner", description: "An undated weekly planner with a linen cover and 52 tear-off sheets.", categorySlug: "stationery", variantLabels: ["A5", "A4"] },
  { slug: "elm-pencil-set", name: "Elm Pencil Set", description: "A set of graphite drawing pencils in six hardness grades with a cedar case.", categorySlug: "stationery", variantLabels: ["Set of 6", "Set of 12"] },
  { slug: "fern-letterpress-cards", name: "Fern Letterpress Cards", description: "Cotton letterpress cards with matching envelopes, printed in a botanical pattern.", categorySlug: "stationery", variantLabels: ["Pack of 8", "Pack of 16"] },
  { slug: "grove-washi-tape", name: "Grove Washi Tape", description: "A set of patterned washi tape rolls for journaling and craft projects.", categorySlug: "stationery", variantLabels: ["Set of 3", "Set of 6"] },
  { slug: "harbor-bookmark-set", name: "Harbor Bookmark Set", description: "Magnetic leather bookmarks in a set of four, stamped by hand.", categorySlug: "stationery", variantLabels: ["Set of 2", "Set of 4"] },
];

function parseSeed(argv: string[]): number {
  const inline = argv.find((arg) => arg.startsWith("--seed="));
  if (inline !== undefined) {
    return Number(inline.slice("--seed=".length));
  }
  const flagIndex = argv.indexOf("--seed");
  if (flagIndex !== -1) {
    return Number(argv[flagIndex + 1] ?? "42");
  }
  return 42;
}

const PRODUCT_EPOCH = Date.UTC(2026, 0, 1);

async function main(): Promise<void> {
  const seed = parseSeed(process.argv);
  if (!Number.isInteger(seed) || seed < 0) {
    throw new Error(`--seed must be a non-negative integer, got ${String(seed)}`);
  }

  // Truncate + reseed: idempotent in outcome, and the counts cannot drift upward.
  await prisma.$executeRawUnsafe(
    'TRUNCATE TABLE "WebhookEvent", "StockReservation", "OrderItem", "Order", "CartItem", "Cart", "Variant", "Product", "Category", "Coupon", "Account", "User" RESTART IDENTITY CASCADE',
  );

  const categoryIds = new Map<string, string>();
  for (const [index, category] of CATEGORIES.entries()) {
    const id = deterministicUuid7(index, `category:${seed}:${category.slug}`);
    categoryIds.set(category.slug, id);
    await prisma.category.create({ data: { id, slug: category.slug, name: category.name } });
  }

  let variantTotal = 0;
  for (const [index, spec] of PRODUCTS.entries()) {
    const categoryId = categoryIds.get(spec.categorySlug);
    if (categoryId === undefined) {
      throw new Error(`unknown category ${spec.categorySlug}`);
    }

    const productId = deterministicUuid7(1000 + index, `product:${seed}:${spec.slug}`);
    const basePriceCents = 1999 + ((index * 337 + seed) % 12_000);

    await prisma.product.create({
      data: {
        id: productId,
        slug: spec.slug,
        name: spec.name,
        description: spec.description,
        categoryId,
        createdAt: new Date(PRODUCT_EPOCH + index * 60_000),
        variants: {
          create: spec.variantLabels.map((label, variantIndex) => ({
            id: deterministicUuid7(
              10_000 + index * 10 + variantIndex,
              `variant:${seed}:${spec.slug}:${label}`,
            ),
            sku: `${spec.slug.toUpperCase()}-${label.toUpperCase().replaceAll(" ", "-")}`,
            name: label,
            priceCents: basePriceCents + variantIndex * 500,
            stock: 5 + ((index * 7 + variantIndex * 3) % 30),
          })),
        },
      },
    });
    variantTotal += spec.variantLabels.length;
  }

  await prisma.coupon.create({
    data: {
      id: deterministicUuid7(90_000, `coupon:${seed}:SAVE10`),
      code: "SAVE10",
      percentOff: 10,
      active: true,
    },
  });

  // Local credentials login. The hashes are Argon2id (the same algorithm the
  // Credentials provider verifies with); the passwords are intentionally
  // well-known development credentials.
  const demoUserId = deterministicUuid7(95_000, `user:${seed}:demo`);
  await prisma.user.create({
    data: {
      id: demoUserId,
      email: "demo@alder.test",
      passwordHash: await hash("demo-password-123"),
      name: "Demo Customer",
      role: "CUSTOMER",
    },
  });

  await prisma.user.create({
    data: {
      id: deterministicUuid7(95_001, `user:${seed}:admin`),
      email: "admin@alder.test",
      passwordHash: await hash("admin-password-123"),
      name: "Demo Admin",
      role: "ADMIN",
    },
  });

  // One REFUND_REQUIRED order so /admin/orders has a real, seeded example of
  // the state the failure path exists for. Snapshots (sku, name, unit price)
  // are written exactly as checkout writes them; the order never changes when
  // the product is edited or archived.
  const refundVariant = await prisma.variant.findFirst({
    where: { product: { slug: "alder-ceramic-mug" } },
    orderBy: { priceCents: "asc" },
    select: { id: true, sku: true, name: true, priceCents: true },
  });
  if (refundVariant === null) {
    throw new Error("seed product alder-ceramic-mug has no variants");
  }
  const refundQuantity = 2;
  const refundSubtotal = refundVariant.priceCents * refundQuantity;

  await prisma.order.create({
    data: {
      id: deterministicUuid7(96_000, `order:${seed}:refund-required`),
      userId: demoUserId,
      status: "REFUND_REQUIRED",
      idempotencyKey: `seed-refund-required-${seed}`,
      subtotalCents: refundSubtotal,
      discountCents: 0,
      totalCents: refundSubtotal,
      currency: "usd",
      stripePaymentIntentId: `pi_seed_refund_required_${seed}`,
      createdAt: new Date(PRODUCT_EPOCH + PRODUCTS.length * 60_000),
      items: {
        create: [
          {
            variantId: refundVariant.id,
            sku: refundVariant.sku,
            nameSnapshot: refundVariant.name,
            unitPriceCents: refundVariant.priceCents,
            quantity: refundQuantity,
          },
        ],
      },
    },
  });

  // Self-checks: the seed contract is executable, not prose.
  const productCount = await prisma.product.count();
  if (productCount !== 40) {
    throw new Error(`expected 40 products, got ${productCount}`);
  }

  const variantCounts = await prisma.variant.groupBy({
    by: ["productId"],
    _count: { _all: true },
  });
  for (const row of variantCounts) {
    if (row._count._all < 2 || row._count._all > 3) {
      throw new Error(`product ${row.productId} has ${row._count._all} variants, expected 2-3`);
    }
  }

  const prices = await prisma.variant.findMany({ select: { priceCents: true } });
  if (!prices.some((row) => row.priceCents % 100 === 99)) {
    throw new Error("no variant price ends in 99");
  }

  const skus = await prisma.variant.findMany({
    select: { sku: true },
    orderBy: { sku: "asc" },
  });
  const skuDigest = createHash("sha256")
    .update(skus.map((row) => row.sku).join("\n"))
    .digest("hex");

  const adminCount = await prisma.user.count({ where: { role: "ADMIN" } });
  if (adminCount !== 1) {
    throw new Error(`expected 1 admin user, got ${adminCount}`);
  }

  // The admin console's REFUND_REQUIRED example is part of the seed contract,
  // not just a fixture: it must exist with its snapshotted line items.
  const refundExample = await prisma.order.findFirst({
    where: { status: "REFUND_REQUIRED" },
    select: { id: true, totalCents: true, items: { select: { id: true } } },
  });
  if (refundExample === null || refundExample.items.length === 0) {
    throw new Error("seed did not create a REFUND_REQUIRED order with items");
  }

  console.log(
    `seed=${seed} categories=${CATEGORIES.length} products=${productCount} variants=${variantTotal} coupons=1 customers=1 admins=1 orders=1 refund_required=${refundExample.totalCents} skus_sha256=${skuDigest}`,
  );
}

main()
  .catch((error: unknown) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
