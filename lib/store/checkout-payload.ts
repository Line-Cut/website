import type { CheckoutLineItem, CheckoutCustomer } from "@/lib/payments/provider";
import type { PricedLine } from "@/lib/store/types";
import type { CheckoutInput } from "@/lib/stickers/checkout-schema";

export function toCheckoutItems(lines: PricedLine[], locale: "he" | "en"): CheckoutLineItem[] {
  return lines.map((l) => ({
    description: locale === "he" ? l.titleHe : l.titleEn,
    catalogNumber: l.productId,
    unitPrice: l.unitPrice,
    quantity: l.quantity,
  }));
}

export function toCheckoutCustomer(d: CheckoutInput): CheckoutCustomer {
  return {
    firstName: d.firstName,
    lastName: d.lastName,
    email: d.email,
    phone: d.phone,
    address: d.addressLine1 ?? null,
    city: d.city ?? null,
    postalCode: d.postalCode ?? null,
  };
}
