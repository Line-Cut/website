import Image from "next/image";
import { formatMoney } from "@/lib/stickers/format";
import type { Dictionary } from "@/lib/dictionary";
import type { Locale } from "@/lib/i18n";

export type DisplayLineItem = {
  title: string;
  imageUrl?: string | null;
  options: { label: string; value: string }[];
  quantity: number;
  unitPrice: number;
  lineTotal: number;
};

/**
 * Read-only line items table for the checkout summary + order receipt.
 * Server-safe (no hooks).
 */
export function StoreLineItems({
  items,
  total,
  currency,
  dict,
  locale,
}: {
  items: DisplayLineItem[];
  total: number;
  currency: string;
  dict: Dictionary["store"];
  locale: Locale;
}) {
  return (
    <div className="overflow-hidden rounded-lg border border-line">
      <ul className="divide-y divide-line">
        {items.map((item, i) => (
          <li key={i} className="flex items-center gap-4 p-4">
            <div className="relative size-14 shrink-0 overflow-hidden rounded-md border border-line bg-paper-2">
              {item.imageUrl && (
                <Image
                  src={item.imageUrl}
                  alt={item.title}
                  fill
                  sizes="56px"
                  className="object-cover"
                />
              )}
            </div>
            <div className="min-w-0 flex-1">
              <p className="truncate font-medium text-ink">{item.title}</p>
              {item.options.length > 0 && (
                <p className="truncate text-sm text-muted">
                  {item.options.map((o) => `${o.label}: ${o.value}`).join(" · ")}
                </p>
              )}
              <p className="text-sm text-muted">
                {item.quantity} ×{" "}
                <span dir="ltr" className="tabular-nums">
                  {formatMoney(item.unitPrice, currency, locale)}
                </span>
              </p>
            </div>
            <div dir="ltr" className="shrink-0 font-medium tabular-nums text-ink">
              {formatMoney(item.lineTotal, currency, locale)}
            </div>
          </li>
        ))}
      </ul>
      <div className="flex items-center justify-between border-t border-line bg-paper-2 px-4 py-3">
        <span className="font-semibold text-ink">{dict.cart.total}</span>
        <span dir="ltr" className="font-display text-lg font-bold tabular-nums text-ink">
          {formatMoney(total, currency, locale)}
        </span>
      </div>
    </div>
  );
}
