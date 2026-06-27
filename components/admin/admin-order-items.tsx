import { formatMoney } from "@/lib/stickers/format";
import type { StoreLineItem } from "@/lib/orders/types";
import type { Locale } from "@/lib/i18n";

type Props = {
  items: StoreLineItem[];
  currency: string;
  lang: Locale;
};

/**
 * Read-only line-items list for the admin order detail page.
 * Mirrors the storefront `StoreLineItems` layout; server-safe (no hooks).
 */
export function AdminOrderItems({ items, currency, lang }: Props) {
  return (
    <div className="overflow-hidden rounded-lg border border-line">
      <ul className="divide-y divide-line">
        {items.map((item, i) => (
          <li
            key={item.productId ?? i}
            className="flex items-start justify-between gap-4 p-4"
          >
            <div className="min-w-0 flex-1">
              <p className="font-medium text-ink">{item.title}</p>
              {item.options.length > 0 && (
                <p className="text-sm text-muted">
                  {item.options
                    .map((o) => `${o.label}: ${o.value}`)
                    .join(", ")}
                </p>
              )}
              <p className="text-sm text-muted">
                {item.quantity} ×{" "}
                <span dir="ltr" className="tabular-nums">
                  {formatMoney(item.unitPrice, currency, lang)}
                </span>
              </p>
            </div>
            <div
              dir="ltr"
              className="shrink-0 font-medium tabular-nums text-ink"
            >
              {formatMoney(item.lineTotal, currency, lang)}
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}
