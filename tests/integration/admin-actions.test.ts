import { randomUUID } from "node:crypto";

import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  transitionOrder: vi.fn(),
  saveVariantStock: vi.fn(),
  saveProductDetails: vi.fn(),
  saveProductSpecs: vi.fn(),
  saveProductVariants: vi.fn(),
  saveProductImages: vi.fn(),
  setProductArchived: vi.fn(),
  revalidated: [] as string[],
}));

vi.mock("@/lib/admin", () => ({
  requireAdmin: async () => "admin-1",
}));

vi.mock("@/lib/admin-orders", () => ({
  transitionOrder: mocks.transitionOrder,
}));

vi.mock("@/lib/admin-products", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("@/lib/admin-products")>();
  return {
    ...actual,
    saveVariantStock: mocks.saveVariantStock,
    saveProductDetails: mocks.saveProductDetails,
    saveProductSpecs: mocks.saveProductSpecs,
    saveProductVariants: mocks.saveProductVariants,
    saveProductImages: mocks.saveProductImages,
    setProductArchived: mocks.setProductArchived,
  };
});

vi.mock("next/cache", () => ({
  revalidatePath: (path: string) => {
    mocks.revalidated.push(path);
  },
}));

vi.mock("next/navigation", () => ({
  redirect: (url: string): never => {
    throw new Error(`REDIRECT:${url}`);
  },
}));

import { updateStockAction } from "@/app/admin/inventory/actions";
import { transitionOrderAction } from "@/app/admin/orders/actions";
import {
  saveProductDetailsAction,
  saveProductImagesAction,
  saveProductSpecsAction,
  saveProductVariantsAction,
  setProductArchivedAction,
} from "@/app/admin/products/actions";

beforeEach(() => {
  for (const mock of [
    mocks.transitionOrder,
    mocks.saveVariantStock,
    mocks.saveProductDetails,
    mocks.saveProductSpecs,
    mocks.saveProductVariants,
    mocks.saveProductImages,
    mocks.setProductArchived,
  ]) {
    mock.mockReset();
  }
  mocks.revalidated = [];
});

function form(fields: Record<string, string>): FormData {
  const data = new FormData();
  for (const [key, value] of Object.entries(fields)) {
    data.set(key, value);
  }
  return data;
}

describe("transitionOrderAction", () => {
  it("records the transition, revalidates both views and confirms it", async () => {
    mocks.transitionOrder.mockResolvedValue({
      ok: true,
      number: "KST-2601-0001",
      status: "FULFILLED",
    });

    await expect(
      transitionOrderAction(
        form({ orderId: "order-1", target: "FULFILLED" }),
      ),
    ).rejects.toThrow(
      "REDIRECT:/admin/orders/KST-2601-0001?updated=FULFILLED",
    );

    expect(mocks.transitionOrder).toHaveBeenCalledWith({
      orderId: "order-1",
      target: "FULFILLED",
      actorId: "admin-1",
    });
    expect(mocks.revalidated).toEqual([
      "/admin",
      "/admin/orders",
      "/admin/orders/KST-2601-0001",
      "/account/orders/KST-2601-0001",
    ]);
  });

  it("returns an illegal transition to the order it did not change", async () => {
    mocks.transitionOrder.mockResolvedValue({
      ok: false,
      reason: "illegal",
      number: "KST-2601-0001",
      message: "Fulfilled orders cannot be cancelled.",
    });

    await expect(
      transitionOrderAction(form({ orderId: "order-1", target: "CANCELLED" })),
    ).rejects.toThrow(
      "REDIRECT:/admin/orders/KST-2601-0001?error=Fulfilled%20orders%20cannot%20be%20cancelled.",
    );
  });

  it("returns other failures to the order list", async () => {
    mocks.transitionOrder.mockResolvedValue({
      ok: false,
      reason: "not_found",
      message: "Order not found.",
    });

    await expect(
      transitionOrderAction(form({ orderId: "missing", target: "PAID" })),
    ).rejects.toThrow("REDIRECT:/admin/orders?error=Order%20not%20found.");
  });
});

describe("updateStockAction", () => {
  it("rejects a stock value that is not a whole number of units", async () => {
    await expect(
      updateStockAction(form({ variantId: randomUUID(), stock: "3.5" })),
    ).rejects.toThrow(
      "REDIRECT:/admin/inventory?error=Stock%20must%20be%20a%20whole%20number%20of%20units.",
    );
    expect(mocks.saveVariantStock).not.toHaveBeenCalled();
  });

  it("surfaces a refused stock change", async () => {
    mocks.saveVariantStock.mockResolvedValue({
      ok: false,
      message: "Variants cannot have negative stock.",
    });

    await expect(
      updateStockAction(form({ variantId: randomUUID(), stock: "2" })),
    ).rejects.toThrow(
      "REDIRECT:/admin/inventory?error=Variants%20cannot%20have%20negative%20stock.",
    );
  });

  it("saves stock and confirms it", async () => {
    mocks.saveVariantStock.mockResolvedValue({ ok: true });
    const variantId = randomUUID();

    await expect(
      updateStockAction(form({ variantId, stock: "12" })),
    ).rejects.toThrow("REDIRECT:/admin/inventory?saved=stock");

    expect(mocks.saveVariantStock).toHaveBeenCalledWith({
      variantId,
      stock: 12,
      actorId: "admin-1",
    });
    expect(mocks.revalidated).toEqual(["/admin/inventory", "/admin"]);
  });
});

describe("saveProductDetailsAction", () => {
  it("rejects a product id that cannot exist", async () => {
    await expect(
      saveProductDetailsAction(
        form({ productId: "not-a-uuid", title: "x", description: "y" }),
      ),
    ).rejects.toThrow("REDIRECT:/admin/products?error=Product+not+found.");
    expect(mocks.saveProductDetails).not.toHaveBeenCalled();
  });

  it("returns a rejected edit to the product page", async () => {
    const productId = randomUUID();
    mocks.saveProductDetails.mockResolvedValue({
      ok: false,
      message: "Enter a title.",
    });

    await expect(
      saveProductDetailsAction(
        form({ productId, title: "", description: "y" }),
      ),
    ).rejects.toThrow(
      `REDIRECT:/admin/products/${productId}?error=Enter%20a%20title.`,
    );
  });

  it("saves details, refreshes the storefront and confirms", async () => {
    const productId = randomUUID();
    mocks.saveProductDetails.mockResolvedValue({ ok: true });

    await expect(
      saveProductDetailsAction(
        form({ productId, title: "Planar 3", description: "Belt drive" }),
      ),
    ).rejects.toThrow(`REDIRECT:/admin/products/${productId}?saved=details`);

    expect(mocks.revalidated).toContain("/admin/products");
    expect(mocks.revalidated).toContain("/p/[slug]");
    expect(mocks.revalidated).toContain("/c/[slug]");
    expect(mocks.revalidated).toContain("/search");
  });
});

describe("saveProductSpecsAction", () => {
  it("rejects malformed rows before saving", async () => {
    const productId = randomUUID();
    const data = form({ productId });
    data.append("specKey", "");
    data.append("specValue", "Belt");

    await expect(saveProductSpecsAction(data)).rejects.toThrow(
      `REDIRECT:/admin/products/${productId}?error=Every%20specification%20needs%20a%20name.`,
    );
    expect(mocks.saveProductSpecs).not.toHaveBeenCalled();
  });

  it("saves parsed specs and confirms", async () => {
    const productId = randomUUID();
    mocks.saveProductSpecs.mockResolvedValue({ ok: true });
    const data = form({ productId });
    data.append("specKey", "drive");
    data.append("specValue", "Belt");

    await expect(saveProductSpecsAction(data)).rejects.toThrow(
      `REDIRECT:/admin/products/${productId}?saved=specs`,
    );
    expect(mocks.saveProductSpecs).toHaveBeenCalledWith({
      productId,
      specs: { drive: "Belt" },
      actorId: "admin-1",
    });
  });
});

describe("saveProductVariantsAction", () => {
  it("rejects a bad id and surfaces a refused save", async () => {
    await expect(
      saveProductVariantsAction(form({ productId: "nope" })),
    ).rejects.toThrow("REDIRECT:/admin/products?error=Product+not+found.");

    const productId = randomUUID();
    mocks.saveProductVariants.mockResolvedValue({
      ok: false,
      message: "A variant needs a SKU.",
    });
    await expect(
      saveProductVariantsAction(form({ productId })),
    ).rejects.toThrow(
      `REDIRECT:/admin/products/${productId}?error=A%20variant%20needs%20a%20SKU.`,
    );
  });

  it("saves variants and confirms", async () => {
    const productId = randomUUID();
    mocks.saveProductVariants.mockResolvedValue({ ok: true });

    await expect(
      saveProductVariantsAction(form({ productId })),
    ).rejects.toThrow(`REDIRECT:/admin/products/${productId}?saved=variants`);
  });
});

describe("saveProductImagesAction", () => {
  it("rejects a bad id and surfaces a refused save", async () => {
    await expect(
      saveProductImagesAction(form({ productId: "nope" })),
    ).rejects.toThrow("REDIRECT:/admin/products?error=Product+not+found.");

    const productId = randomUUID();
    mocks.saveProductImages.mockResolvedValue({
      ok: false,
      message: "Images need alt text.",
    });
    await expect(
      saveProductImagesAction(form({ productId })),
    ).rejects.toThrow(
      `REDIRECT:/admin/products/${productId}?error=Images%20need%20alt%20text.`,
    );
  });

  it("saves images and confirms", async () => {
    const productId = randomUUID();
    mocks.saveProductImages.mockResolvedValue({ ok: true });

    await expect(
      saveProductImagesAction(form({ productId })),
    ).rejects.toThrow(`REDIRECT:/admin/products/${productId}?saved=images`);
  });
});

describe("setProductArchivedAction", () => {
  it("rejects a bad id", async () => {
    await expect(
      setProductArchivedAction(form({ productId: "nope" })),
    ).rejects.toThrow("REDIRECT:/admin/products?error=Product+not+found.");
  });

  it("returns a refused archive to the list", async () => {
    mocks.setProductArchived.mockResolvedValue({
      ok: false,
      message: "Product not found.",
    });

    await expect(
      setProductArchivedAction(
        form({ productId: randomUUID(), archived: "true" }),
      ),
    ).rejects.toThrow(
      "REDIRECT:/admin/products?error=Product%20not%20found.",
    );
  });

  it("reports archive and restore distinctly", async () => {
    mocks.setProductArchived.mockResolvedValue({ ok: true });
    const productId = randomUUID();

    await expect(
      setProductArchivedAction(form({ productId, archived: "true" })),
    ).rejects.toThrow("REDIRECT:/admin/products?saved=archived");

    await expect(
      setProductArchivedAction(form({ productId, archived: "false" })),
    ).rejects.toThrow("REDIRECT:/admin/products?saved=restored");
  });
});
