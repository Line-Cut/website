import Link from "next/link";
import { formatMoney } from "@/lib/stickers/format";
import type { AdminOrderSummary } from "@/lib/orders/admin-types";
import type { OrderStatus, PaymentStatus } from "@/lib/orders/types";
import type { Dictionary } from "@/lib/dictionary";
import type { Locale } from "@/lib/i18n";

type Props = {
  orders: AdminOrderSummary[];
  dict: Dictionary["admin"]["orders"];
  statusDict: Dictionary["stickers"]["status"];
  lang: Locale;
};

// Same status palette as the customer-facing order history — not colour-alone,
// always paired with a text label.
const STATUS_STYLES: Record<OrderStatus, string> = {
  received: "bg-accent/10 text-accent",
  seen: "bg-accent/15 text-accent",
  in_production: "bg-accent/20 text-accent",
  ready: "bg-green-100 text-green-800",
  shipped: "bg-blue-100 text-blue-800",
  delivered: "bg-green-200 text-green-900",
  cancelled: "bg-line text-muted",
};

const PAYMENT_STYLES: Record<PaymentStatus, string> = {
  awaiting_payment: "bg-line text-muted",
  paid: "bg-green-100 text-green-800",
  refunded: "bg-blue-100 text-blue-800",
  waived: "bg-accent/10 text-accent",
};

const BADGE = "inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium";

/** Server-rendered admin orders table. Pure presentational — no hooks. */
export function AdminOrderTable({ orders, dict, statusDict, lang }: Props) {
  if (orders.length === 0) {
    return <p className="py-12 text-center text-muted">{dict.empty}</p>;
  }

  const bcp47 = lang === "he" ? "he-IL" : "en-IL";

  return (
    <div className="overflow-x-auto rounded-lg border border-line">
      <table className="min-w-full divide-y divide-line text-sm">
        <thead className="bg-paper-2">
          <tr className="text-xs uppercase tracking-wide text-muted">
            <th className="px-4 py-3 text-start font-medium">{dict.date}</th>
            <th className="px-4 py-3 text-start font-medium">{dict.order}</th>
            <th className="px-4 py-3 text-start font-medium">{dict.customer}</th>
            <th className="px-4 py-3 text-start font-medium">{dict.kind}</th>
            <th className="px-4 py-3 text-start font-medium">{dict.items}</th>
            <th className="px-4 py-3 text-start font-medium">{dict.total}</th>
            <th className="px-4 py-3 text-start font-medium">{dict.status}</th>
            <th className="px-4 py-3 text-start font-medium">{dict.payment}</th>
            <th className="px-4 py-3 text-end font-medium">
              <span className="sr-only">{dict.viewOrder}</span>
            </th>
          </tr>
        </thead>
        <tbody className="divide-y divide-line">
          {orders.map((order) => {
            const href = `/${lang}/admin/orders/${order.orderId}`;
            const formattedDate = new Intl.DateTimeFormat(bcp47).format(
              new Date(order.createdAtISO),
            );
            const kindLabel =
              order.kind === "stickers" ? dict.kindStickers : dict.kindStore;

            return (
              <tr key={order.orderId} className="bg-paper hover:bg-paper-2">
                <td className="whitespace-nowrap px-4 py-3 text-muted">
                  {formattedDate}
                </td>
                <td className="px-4 py-3">
                  <Link
                    href={href}
                    dir="ltr"
                    className="font-mono text-accent underline-offset-2 hover:underline"
                  >
                    {order.orderId.slice(0, 8)}…
                  </Link>
                </td>
                <td className="px-4 py-3">
                  <div className="flex flex-col">
                    <span className="font-medium text-ink">
                      {order.contactName}
                    </span>
                    <span dir="ltr" className="text-xs text-muted">
                      {order.contactEmail}
                    </span>
                  </div>
                </td>
                <td className="px-4 py-3">
                  <span className="inline-flex items-center rounded-full border border-line bg-paper-2 px-2.5 py-0.5 text-xs font-medium text-ink">
                    {kindLabel}
                  </span>
                </td>
                <td className="px-4 py-3 tabular-nums text-ink">
                  {order.itemCount}
                </td>
                <td className="whitespace-nowrap px-4 py-3">
                  <span dir="ltr" className="tabular-nums text-ink">
                    {formatMoney(order.total, order.currency, lang)}
                  </span>
                </td>
                <td className="px-4 py-3">
                  <span
                    className={`${BADGE} ${STATUS_STYLES[order.status] ?? "bg-line text-muted"}`}
                  >
                    {statusDict[order.status]}
                  </span>
                </td>
                <td className="px-4 py-3">
                  <span
                    className={`${BADGE} ${PAYMENT_STYLES[order.paymentStatus] ?? "bg-line text-muted"}`}
                  >
                    {order.paymentStatus.replace(/_/g, " ")}
                  </span>
                </td>
                <td className="whitespace-nowrap px-4 py-3 text-end">
                  <Link
                    href={href}
                    className="text-sm font-medium text-accent underline-offset-2 hover:underline"
                  >
                    {dict.viewOrder}
                  </Link>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
