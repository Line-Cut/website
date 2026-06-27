import type { Locale } from "@/lib/i18n";
import type { StoreLineItem } from "@/lib/orders/types";
import type { SelectedOptionSnapshot } from "@/lib/store/types";

/** Columns selected for an order's line items. */
export const ORDER_ITEM_COLUMNS =
  "product_id, title_he, title_en, image_url, options, quantity, unit_price, line_total, sort_index";

export type OrderItemRow = {
  product_id: string | null;
  title_he: string;
  title_en: string;
  image_url: string | null;
  options: unknown;
  quantity: number;
  unit_price: number;
  line_total: number;
  sort_index: number;
};

/** Pure mapper: order_items rows → localized StoreLineItem[] (sorted). */
export function mapStoreItems(rows: OrderItemRow[], locale: Locale): StoreLineItem[] {
  const he = locale === "he";
  return [...rows]
    .sort((a, b) => a.sort_index - b.sort_index)
    .map((r) => {
      const snap = Array.isArray(r.options)
        ? (r.options as SelectedOptionSnapshot[])
        : [];
      return {
        productId: r.product_id ?? undefined,
        title: he ? r.title_he : r.title_en,
        imageUrl: r.image_url ?? undefined,
        options: snap.map((o) => ({
          label: he ? o.labelHe : o.labelEn,
          value: he ? o.choiceHe : o.choiceEn,
        })),
        quantity: r.quantity,
        unitPrice: r.unit_price,
        lineTotal: r.line_total,
      };
    });
}
