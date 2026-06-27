import type {
  Product,
  CartItemInput,
  PricedLine,
  SelectedOptionSnapshot,
  StoreTotals,
} from "@/lib/store/types";

/** Upper bound on the quantity of a single cart line. */
export const MAX_CART_QUANTITY = 999;
/** Upper bound on the number of distinct lines in one cart. */
export const MAX_CART_LINES = 100;

export type PricingError =
  | { code: "empty" }
  | { code: "too_many_lines" }
  | { code: "unknown_product"; productId: string }
  | { code: "invalid_quantity"; productId: string }
  | { code: "missing_option"; productId: string; optionKey: string }
  | { code: "invalid_option"; productId: string; optionKey: string }
  | { code: "mixed_currency" };

export type StoreTotalsResult =
  | { ok: true; totals: StoreTotals }
  | { ok: false; error: PricingError };

/**
 * Server-authoritative cart pricing. Pure and deterministic — the server
 * recomputes every unit price from the products table so a tampered client
 * price can never reach an order. All money is in agorot.
 *
 * @param productsById - map of active products keyed by id
 * @param items        - cart items as sent by the client (price untrusted)
 */
export function computeStoreTotals(
  productsById: Map<string, Product>,
  items: CartItemInput[],
): StoreTotalsResult {
  if (items.length === 0) return { ok: false, error: { code: "empty" } };
  if (items.length > MAX_CART_LINES) {
    return { ok: false, error: { code: "too_many_lines" } };
  }

  const lines: PricedLine[] = [];
  let currency: string | null = null;

  for (const item of items) {
    const product = productsById.get(item.productId);
    if (!product) {
      return { ok: false, error: { code: "unknown_product", productId: item.productId } };
    }

    const qty = Math.floor(item.quantity);
    if (!Number.isFinite(qty) || qty < 1 || qty > MAX_CART_QUANTITY) {
      return { ok: false, error: { code: "invalid_quantity", productId: item.productId } };
    }

    if (currency === null) currency = product.currency;
    else if (currency !== product.currency) {
      return { ok: false, error: { code: "mixed_currency" } };
    }

    const selected = item.selectedOptions ?? {};
    const snapshot: SelectedOptionSnapshot[] = [];
    let optionDelta = 0;

    for (const option of product.options) {
      const chosenValue = selected[option.key];
      if (chosenValue == null || chosenValue === "") {
        return {
          ok: false,
          error: { code: "missing_option", productId: item.productId, optionKey: option.key },
        };
      }
      const choice = option.choices.find((c) => c.value === chosenValue);
      if (!choice) {
        return {
          ok: false,
          error: { code: "invalid_option", productId: item.productId, optionKey: option.key },
        };
      }
      optionDelta += choice.priceDelta;
      snapshot.push({
        key: option.key,
        labelHe: option.labelHe,
        labelEn: option.labelEn,
        value: choice.value,
        choiceHe: choice.labelHe,
        choiceEn: choice.labelEn,
        priceDelta: choice.priceDelta,
      });
    }

    const unitPrice = Math.max(0, product.price + optionDelta);
    const lineTotal = unitPrice * qty;

    lines.push({
      productId: product.id,
      titleHe: product.titleHe,
      titleEn: product.titleEn,
      imageUrl: product.imageUrl,
      options: snapshot,
      quantity: qty,
      unitPrice,
      lineTotal,
    });
  }

  const total = lines.reduce((sum, line) => sum + line.lineTotal, 0);
  return { ok: true, totals: { lines, total, currency: currency ?? "ILS" } };
}
