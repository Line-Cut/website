import { interpolate } from "@/lib/stickers/format";
import type { OrderView } from "@/lib/stickers/types";
import type { Dictionary } from "@/lib/dictionary";
import { PriceBreakdown } from "@/components/stickers/price-breakdown";
import { OrderStatusTimeline } from "@/components/stickers/order-status-timeline";

type Props = {
  order: OrderView;
  dict: Dictionary["stickers"];
  locale: "he" | "en";
};

/**
 * Store-like order receipt.
 * Pure presentational — no hooks, server-safe.
 */
export function OrderReceipt({ order, dict, locale }: Props) {
  const bcp47 = locale === "he" ? "he-IL" : "en-IL";
  const formattedDate = new Intl.DateTimeFormat(bcp47).format(
    new Date(order.createdAtISO),
  );

  const { delivery } = order;

  return (
    <article className="flex flex-col gap-6 rounded-lg border border-line bg-paper p-6 text-ink">
      {/* Heading */}
      <header className="border-b border-line pb-4">
        <h2 className="font-display text-2xl font-bold">{dict.receipt.heading}</h2>
        <p className="mt-1 text-sm text-muted">
          {interpolate(dict.receipt.placedOn, { date: formattedDate })}
        </p>
        <p className="mt-1 text-base font-medium">
          {/* Split around {id} so we can wrap the id in dir="ltr" */}
          {dict.receipt.orderNumber.replace("{id}", "").trim()}{" "}
          <span dir="ltr" className="font-mono tabular-nums">
            {order.orderId}
          </span>
        </p>
      </header>

      {/* No-payment notice */}
      <div
        role="note"
        className="rounded-md border border-accent/30 bg-accent/5 px-4 py-3 text-sm font-medium text-accent"
      >
        {dict.receipt.noPaymentYet}
      </div>

      {/* Delivery summary */}
      <section aria-label={dict.checkout.heading}>
        <h3 className="mb-2 text-sm font-semibold uppercase tracking-wide text-muted">
          {delivery.method === "shipping"
            ? dict.receipt.deliveryTo
            : dict.checkout.methodPickup}
        </h3>
        <p className="text-ink">{delivery.fullName}</p>
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
            {delivery.addressLine2 && (
              <>
                {", "}
                <span>{delivery.addressLine2}</span>
              </>
            )}
            {delivery.city && (
              <>
                {", "}
                <span>{delivery.city}</span>
              </>
            )}
            {delivery.postalCode && (
              <>
                {" "}
                <span dir="ltr">{delivery.postalCode}</span>
              </>
            )}
            {delivery.country && (
              <>
                {", "}
                <span>{delivery.country}</span>
              </>
            )}
          </address>
        )}
      </section>

      {/* Price breakdown */}
      <section aria-label={dict.pricing.heading}>
        <h3 className="mb-2 text-sm font-semibold uppercase tracking-wide text-muted">
          {dict.pricing.heading}
        </h3>
        <PriceBreakdown
          breakdown={order.breakdown}
          dict={dict.pricing}
          locale={locale}
        />
      </section>

      {/* Status timeline */}
      <section aria-label={dict.status.heading}>
        <h3 className="mb-2 text-sm font-semibold uppercase tracking-wide text-muted">
          {dict.status.heading}
        </h3>
        <OrderStatusTimeline status={order.status} dict={dict.status} />
      </section>

      {/* Save link prompt (for guests) */}
      {order.guestToken && (
        <p className="text-sm text-muted">{dict.receipt.saveLink}</p>
      )}
    </article>
  );
}
