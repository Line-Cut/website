import type { CheckoutInput } from "@/lib/stickers/checkout-schema";
import type { PricedLine } from "@/lib/store/types";
import { formatMoney } from "@/lib/stickers/format";

export type OwnerStoreEmailInput = {
  orderId: string;
  ownerOrderUrl: string;
  contactName: string;
  contactEmail: string;
  contactPhone?: string | null;
  delivery: CheckoutInput;
  lines: PricedLine[];
  total: number;
  currency: string;
  locale: "he" | "en";
};

/**
 * Pure builder — no IO. Plain-text owner notification for a confirmed STORE
 * order (catalog products). Mirrors buildOwnerOrderEmail for sticker orders.
 */
export function buildOwnerStoreEmail(input: OwnerStoreEmailInput): {
  subject: string;
  text: string;
  replyTo: string;
} {
  const {
    orderId,
    ownerOrderUrl,
    contactName,
    contactEmail,
    contactPhone,
    delivery,
    lines,
    total,
    currency,
    locale,
  } = input;

  const shortId = orderId.replace(/-/g, "").slice(-8).toUpperCase();
  const subject = `Line Cut — new store order ${shortId}`;
  const fmt = (amount: number) => formatMoney(amount, currency, locale);

  const text: string[] = [
    `New store order confirmed`,
    ``,
    `Order ID:      ${orderId}`,
    ``,
    `--- Customer ---`,
    `Name:          ${contactName}`,
    `Email:         ${contactEmail}`,
    `Phone:         ${contactPhone ?? "-"}`,
    ``,
    `--- Delivery ---`,
    `Method:        ${delivery.method}`,
  ];

  if (delivery.method === "shipping") {
    text.push(`Address:       ${delivery.addressLine1 ?? ""}`);
    if (delivery.addressLine2) text.push(`               ${delivery.addressLine2}`);
    text.push(`City:          ${delivery.city ?? ""}`);
    text.push(`Postal code:   ${delivery.postalCode ?? ""}`);
    if (delivery.country) text.push(`Country:       ${delivery.country}`);
  }
  if (delivery.notes) text.push(`Notes:         ${delivery.notes}`);

  text.push(``, `--- Items ---`);
  for (const line of lines) {
    const opts = line.options.length
      ? ` (${line.options.map((o) => `${o.labelEn}: ${o.choiceEn}`).join(", ")})`
      : "";
    text.push(
      `${line.quantity} × ${line.titleEn}${opts} — ${fmt(line.unitPrice)} = ${fmt(line.lineTotal)}`,
    );
  }

  text.push(
    ``,
    `Total:         ${fmt(total)}`,
    ``,
    `--- Manage ---`,
    `Open order:    ${ownerOrderUrl}`,
  );

  return { subject, text: text.join("\n"), replyTo: contactEmail };
}
