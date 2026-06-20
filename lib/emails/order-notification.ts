import type { CheckoutInput } from "@/lib/stickers/checkout-schema";
import type { PriceBreakdown } from "@/lib/stickers/pricing";
import { formatMoney } from "@/lib/stickers/format";

export type OwnerOrderEmailInput = {
  orderId: string;
  ownerFilesUrl: string;
  contactName: string;
  contactEmail: string;
  contactPhone?: string | null;
  delivery: CheckoutInput;
  copies: number;
  stickerCount: number;
  breakdown: PriceBreakdown;
  locale: "he" | "en";
};

/**
 * Pure builder — no IO. Builds a plain-text owner notification email for a
 * confirmed sticker order. Call this then hand the result to Resend.
 */
export function buildOwnerOrderEmail(input: OwnerOrderEmailInput): {
  subject: string;
  text: string;
  replyTo: string;
} {
  const {
    orderId,
    ownerFilesUrl,
    contactName,
    contactEmail,
    contactPhone,
    delivery,
    copies,
    stickerCount,
    breakdown,
    locale,
  } = input;

  // Short id for the subject line (last 8 chars of UUID)
  const shortId = orderId.replace(/-/g, "").slice(-8).toUpperCase();

  const subject = `Line Cut — new sticker order ${shortId}`;

  const currency = breakdown.currency;
  const fmt = (amount: number) => formatMoney(amount, currency, locale);

  const lines: string[] = [
    `New sticker order confirmed`,
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
    lines.push(`Address:       ${delivery.addressLine1 ?? ""}`);
    if (delivery.addressLine2) {
      lines.push(`               ${delivery.addressLine2}`);
    }
    lines.push(`City:          ${delivery.city ?? ""}`);
    lines.push(`Postal code:   ${delivery.postalCode ?? ""}`);
    if (delivery.country) {
      lines.push(`Country:       ${delivery.country}`);
    }
  }

  if (delivery.notes) {
    lines.push(`Notes:         ${delivery.notes}`);
  }

  lines.push(
    ``,
    `--- Order details ---`,
    `Sticker designs: ${stickerCount}`,
    `Copies:          ${copies}`,
    ``,
    `--- Pricing snapshot ---`,
    `Sheets:          ${breakdown.totalSheets} × ${fmt(breakdown.perSheetRate)} = ${fmt(breakdown.sheetsSubtotal)}`,
    `Setup fee:       ${fmt(breakdown.setupFee)}`,
    `Total:           ${fmt(breakdown.total)}`,
    ``,
    `--- Files ---`,
    `Download files:  ${ownerFilesUrl}`,
    ``,
    `(Link is valid per ORDER_FILES_LINK_TTL setting)`,
  );

  return {
    subject,
    text: lines.join("\n"),
    replyTo: contactEmail,
  };
}
