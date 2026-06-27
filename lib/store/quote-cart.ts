import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import type { Locale } from "@/lib/i18n";
import { computeStoreTotals } from "@/lib/store/pricing";
import { parseCartItems } from "@/lib/store/cart-schema";
import {
  PRODUCT_COLUMNS,
  rowToProduct,
  type ProductRow,
} from "@/lib/store/product-row";
import type { Product } from "@/lib/store/types";

export type QuoteCartDeps = {
  admin: SupabaseClient;
};

/** A localized, server-priced cart line for display. */
export type QuoteLine = {
  productId: string;
  title: string;
  imageUrl: string | null;
  options: { label: string; value: string }[];
  quantity: number;
  unitPrice: number; // agorot
  lineTotal: number; // agorot
};

export type QuoteCartResult =
  | {
      ok: true;
      lines: QuoteLine[];
      total: number;
      currency: string;
      /** productIds in the cart that are no longer available (archived/deleted). */
      removed: string[];
    }
  | { ok: false; message: string };

/**
 * Server-authoritative cart quote. Recomputes every price from the products
 * table (the client price is display-only) and flags unavailable products so
 * the cart page can prompt the buyer. Unavailable products are dropped from the
 * quote rather than erroring, so a partially-stale cart still gets a total.
 */
export async function quoteCart(
  items: unknown,
  locale: Locale,
  deps: QuoteCartDeps,
): Promise<QuoteCartResult> {
  const parsed = parseCartItems(items);
  if (!parsed.success) return { ok: false, message: parsed.message };
  const cartItems = parsed.data;

  const ids = [...new Set(cartItems.map((i) => i.productId))];
  const { data, error } = await deps.admin
    .from("products")
    .select(PRODUCT_COLUMNS)
    .in("id", ids)
    .eq("status", "active");

  if (error) return { ok: false, message: "db_error" };

  const products = (data as unknown as ProductRow[]).map(rowToProduct);
  const map = new Map<string, Product>(products.map((p) => [p.id, p]));
  const removed = ids.filter((id) => !map.has(id));

  const available = cartItems.filter((i) => map.has(i.productId));
  if (available.length === 0) {
    return { ok: true, lines: [], total: 0, currency: "ILS", removed };
  }

  const priced = computeStoreTotals(map, available);
  if (!priced.ok) return { ok: false, message: priced.error.code };

  const he = locale === "he";
  const lines: QuoteLine[] = priced.totals.lines.map((line) => ({
    productId: line.productId,
    title: he ? line.titleHe : line.titleEn,
    imageUrl: line.imageUrl,
    options: line.options.map((o) => ({
      label: he ? o.labelHe : o.labelEn,
      value: he ? o.choiceHe : o.choiceEn,
    })),
    quantity: line.quantity,
    unitPrice: line.unitPrice,
    lineTotal: line.lineTotal,
  }));

  return {
    ok: true,
    lines,
    total: priced.totals.total,
    currency: priced.totals.currency,
    removed,
  };
}
