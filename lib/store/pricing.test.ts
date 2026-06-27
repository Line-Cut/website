import { describe, it, expect } from "vitest";
import { computeStoreTotals, MAX_CART_QUANTITY } from "@/lib/store/pricing";
import type { Product } from "@/lib/store/types";

function makeProduct(overrides: Partial<Product> = {}): Product {
  return {
    id: "p1",
    slug: "mug",
    status: "active",
    titleHe: "ספל",
    titleEn: "Mug",
    descriptionHe: "",
    descriptionEn: "",
    price: 5000, // 50.00 ILS
    currency: "ILS",
    imageUrl: "https://cdn/mug.webp",
    images: [],
    options: [],
    sortIndex: 0,
    createdAtISO: "2026-06-27T00:00:00.000Z",
    updatedAtISO: "2026-06-27T00:00:00.000Z",
    ...overrides,
  };
}

function mapOf(...products: Product[]): Map<string, Product> {
  return new Map(products.map((p) => [p.id, p]));
}

describe("computeStoreTotals", () => {
  it("empty cart → error", () => {
    const result = computeStoreTotals(mapOf(makeProduct()), []);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe("empty");
  });

  it("single line, no options → unit price = base, line total = base × qty", () => {
    const product = makeProduct();
    const result = computeStoreTotals(mapOf(product), [
      { productId: "p1", quantity: 3 },
    ]);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.totals.total).toBe(15000);
      expect(result.totals.currency).toBe("ILS");
      expect(result.totals.lines[0].unitPrice).toBe(5000);
      expect(result.totals.lines[0].lineTotal).toBe(15000);
      // Title snapshot carried for both languages
      expect(result.totals.lines[0].titleEn).toBe("Mug");
      expect(result.totals.lines[0].titleHe).toBe("ספל");
    }
  });

  it("adds option priceDelta to the unit price and snapshots the choice", () => {
    const product = makeProduct({
      options: [
        {
          key: "size",
          labelHe: "גודל",
          labelEn: "Size",
          choices: [
            { value: "a4", labelHe: "A4", labelEn: "A4", priceDelta: 0 },
            { value: "a3", labelHe: "A3", labelEn: "A3", priceDelta: 1500 },
          ],
        },
      ],
    });
    const result = computeStoreTotals(mapOf(product), [
      { productId: "p1", quantity: 2, selectedOptions: { size: "a3" } },
    ]);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.totals.lines[0].unitPrice).toBe(6500); // 5000 + 1500
      expect(result.totals.lines[0].lineTotal).toBe(13000);
      expect(result.totals.lines[0].options).toEqual([
        {
          key: "size",
          labelHe: "גודל",
          labelEn: "Size",
          value: "a3",
          choiceHe: "A3",
          choiceEn: "A3",
          priceDelta: 1500,
        },
      ]);
    }
  });

  it("missing a required option → error", () => {
    const product = makeProduct({
      options: [
        { key: "size", labelHe: "גודל", labelEn: "Size", choices: [{ value: "a4", labelHe: "A4", labelEn: "A4", priceDelta: 0 }] },
      ],
    });
    const result = computeStoreTotals(mapOf(product), [{ productId: "p1", quantity: 1 }]);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe("missing_option");
  });

  it("invalid option value → error", () => {
    const product = makeProduct({
      options: [
        { key: "size", labelHe: "גודל", labelEn: "Size", choices: [{ value: "a4", labelHe: "A4", labelEn: "A4", priceDelta: 0 }] },
      ],
    });
    const result = computeStoreTotals(mapOf(product), [
      { productId: "p1", quantity: 1, selectedOptions: { size: "xl" } },
    ]);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe("invalid_option");
  });

  it("unknown product id → error", () => {
    const result = computeStoreTotals(mapOf(makeProduct()), [
      { productId: "nope", quantity: 1 },
    ]);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe("unknown_product");
  });

  it("quantity below 1 or above the cap → error", () => {
    const product = makeProduct();
    expect(computeStoreTotals(mapOf(product), [{ productId: "p1", quantity: 0 }]).ok).toBe(false);
    expect(
      computeStoreTotals(mapOf(product), [{ productId: "p1", quantity: MAX_CART_QUANTITY + 1 }]).ok,
    ).toBe(false);
  });

  it("mixed currencies across lines → error", () => {
    const ils = makeProduct({ id: "a", currency: "ILS" });
    const usd = makeProduct({ id: "b", currency: "USD" });
    const result = computeStoreTotals(mapOf(ils, usd), [
      { productId: "a", quantity: 1 },
      { productId: "b", quantity: 1 },
    ]);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe("mixed_currency");
  });

  it("sums multiple lines", () => {
    const a = makeProduct({ id: "a", price: 1000 });
    const b = makeProduct({ id: "b", price: 2500 });
    const result = computeStoreTotals(mapOf(a, b), [
      { productId: "a", quantity: 2 }, // 2000
      { productId: "b", quantity: 1 }, // 2500
    ]);
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.totals.total).toBe(4500);
  });
});
