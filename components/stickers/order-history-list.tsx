import Link from "next/link";
import { formatMoney, interpolate } from "@/lib/stickers/format";
import type { OrderView } from "@/lib/stickers/types";
import type { Dictionary } from "@/lib/dictionary";
import type { Locale } from "@/lib/i18n";

type Props = {
  orders: OrderView[];
  dict: Dictionary["stickers"];
  locale: Locale;
  lang: Locale;
};

type StatusBadgeProps = {
  status: OrderView["status"];
  dict: Dictionary["stickers"]["status"];
};

/** Compact inline status badge. Not color-alone: also uses a text label. */
function OrderStatusBadge({ status, dict }: StatusBadgeProps) {
  const statusStyles: Record<OrderView["status"], string> = {
    received: "bg-accent/10 text-accent",
    seen: "bg-accent/15 text-accent",
    in_production: "bg-accent/20 text-accent",
    ready: "bg-green-100 text-green-800",
    shipped: "bg-blue-100 text-blue-800",
    delivered: "bg-green-200 text-green-900",
    cancelled: "bg-line text-muted",
  };

  return (
    <span
      className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${statusStyles[status] ?? "bg-line text-muted"}`}
    >
      {dict[status]}
    </span>
  );
}

/**
 * Server-renderable order history list.
 * Pure presentational — no hooks.
 */
export function OrderHistoryList({ orders, dict, locale, lang }: Props) {
  if (orders.length === 0) {
    return (
      <p className="py-12 text-center text-muted">{dict.account.empty}</p>
    );
  }

  const bcp47 = locale === "he" ? "he-IL" : "en-IL";

  return (
    <ul className="flex flex-col gap-4" aria-label={dict.account.ordersHeading}>
      {orders.map((order) => {
        const formattedDate = new Intl.DateTimeFormat(bcp47).format(
          new Date(order.createdAtISO),
        );
        const formattedTotal = formatMoney(order.total, order.currency, locale);
        const summary =
          order.kind === "stickers"
            ? `${order.breakdown.uniqueCount} × ${order.breakdown.copies}`
            : interpolate(dict.account.itemsLabel, { n: order.items.length });
        const trackHref =
          order.kind === "store"
            ? `/${lang}/store/track/${order.guestToken}`
            : `/${lang}/stickers/track/${order.guestToken}`;

        return (
          <li
            key={order.orderId}
            className="flex flex-col gap-3 rounded-lg border border-line bg-paper p-5 sm:flex-row sm:items-center sm:justify-between"
          >
            {/* Left: date + order ID + sticker count */}
            <div className="flex flex-col gap-1">
              <p className="text-xs text-muted">{formattedDate}</p>
              <p className="font-medium text-ink">
                <span dir="ltr" className="font-mono tabular-nums text-sm">
                  {order.orderId.slice(0, 8)}…
                </span>
              </p>
              <p className="text-sm text-muted">{summary}</p>
            </div>

            {/* Middle: status badge + total */}
            <div className="flex items-center gap-4">
              <div className="flex flex-col items-start gap-1">
                <span className="text-xs text-muted">
                  {dict.account.statusLabel}
                </span>
                <OrderStatusBadge status={order.status} dict={dict.status} />
              </div>
              <div className="flex flex-col items-start gap-1">
                <span className="text-xs text-muted">
                  {dict.account.totalLabel}
                </span>
                <span
                  dir="ltr"
                  className="font-medium text-ink tabular-nums"
                >
                  {formattedTotal}
                </span>
              </div>
            </div>

            {/* Right: view link via guest token */}
            {order.guestToken && (
              <Link
                href={trackHref}
                className="shrink-0 text-sm font-medium text-accent underline underline-offset-2 hover:text-accent/80"
              >
                {dict.account.viewOrder}
              </Link>
            )}
          </li>
        );
      })}
    </ul>
  );
}
