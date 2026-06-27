import { interpolate } from "@/lib/stickers/format";
import type { StoreOrderView } from "@/lib/orders/types";
import type { Dictionary } from "@/lib/dictionary";
import type { Locale } from "@/lib/i18n";
import { StoreLineItems } from "@/components/store/store-line-items";
import { OrderStatusTimeline } from "@/components/stickers/order-status-timeline";

/** Store order receipt (guest tracking). Pure presentational, server-safe. */
export function StoreOrderReceipt({
  order,
  dict,
  locale,
}: {
  order: StoreOrderView;
  dict: Dictionary["store"];
  locale: Locale;
}) {
  const bcp47 = locale === "he" ? "he-IL" : "en-IL";
  const formattedDate = new Intl.DateTimeFormat(bcp47).format(new Date(order.createdAtISO));
  const { delivery } = order;

  return (
    <article className="flex flex-col gap-6 rounded-lg border border-line bg-paper p-6 text-ink">
      <header className="border-b border-line pb-4">
        <h2 className="font-display text-2xl font-bold">{dict.receipt.heading}</h2>
        <p className="mt-1 text-sm text-muted">
          {interpolate(dict.receipt.placedOn, { date: formattedDate })}
        </p>
        <p className="mt-1 text-base font-medium">
          {dict.receipt.orderNumber.replace("{id}", "").trim()}{" "}
          <span dir="ltr" className="font-mono tabular-nums">
            {order.orderId}
          </span>
        </p>
      </header>

      <div
        role="note"
        className="rounded-md border border-accent/30 bg-accent/5 px-4 py-3 text-sm font-medium text-accent"
      >
        {dict.receipt.noPaymentYet}
      </div>

      {/* Delivery summary */}
      <section aria-label={dict.checkout.heading}>
        <h3 className="mb-2 text-sm font-semibold uppercase tracking-wide text-muted">
          {delivery.method === "shipping" ? dict.receipt.deliveryTo : dict.checkout.methodPickup}
        </h3>
        <p className="text-ink">
          {[delivery.firstName, delivery.lastName].filter(Boolean).join(" ")}
        </p>
        <p>
          <span dir="ltr" className="text-ink">
            {delivery.phone}
          </span>
        </p>
        <p>
          <span dir="ltr" className="text-ink">
            {delivery.email}
          </span>
        </p>
        {delivery.method === "shipping" && (
          <address className="mt-1 not-italic text-muted">
            {delivery.addressLine1 && <span>{delivery.addressLine1}</span>}
            {delivery.addressLine2 && <span>{", "}{delivery.addressLine2}</span>}
            {delivery.city && <span>{", "}{delivery.city}</span>}
            {delivery.postalCode && (
              <span>
                {" "}
                <span dir="ltr">{delivery.postalCode}</span>
              </span>
            )}
            {delivery.country && <span>{", "}{delivery.country}</span>}
          </address>
        )}
      </section>

      {/* Items */}
      <section aria-label={dict.receipt.itemsHeading}>
        <h3 className="mb-2 text-sm font-semibold uppercase tracking-wide text-muted">
          {dict.receipt.itemsHeading}
        </h3>
        <StoreLineItems
          items={order.items}
          total={order.total}
          currency={order.currency}
          dict={dict}
          locale={locale}
        />
      </section>

      {/* Status */}
      <section aria-label={dict.status.heading}>
        <h3 className="mb-2 text-sm font-semibold uppercase tracking-wide text-muted">
          {dict.status.heading}
        </h3>
        <OrderStatusTimeline status={order.status} dict={dict.status} />
      </section>

      {order.guestToken && <p className="text-sm text-muted">{dict.receipt.saveLink}</p>}
    </article>
  );
}
