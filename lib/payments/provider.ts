/** unitPrice/amount are in minor units (agorot for ILS). */
export type CheckoutLineItem = {
  description: string;
  catalogNumber: string | null;
  unitPrice: number;
  quantity: number;
};
export type CheckoutCustomer = {
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  address?: string | null;
  city?: string | null;
  postalCode?: string | null;
};
export type CreateCheckoutInput = {
  orderId: string;
  amount: number;
  currency: string;
  locale: "he" | "en";
  items: CheckoutLineItem[];
  customer: CheckoutCustomer;
  redirectUrl: string;
  ipnUrl: string;
};
export type CreateCheckoutResult =
  | { status: "redirect"; url: string; reference: string }
  | { status: "paid"; reference: string }
  | { status: "failed"; reason: string };

export interface PaymentProvider {
  createCheckout(input: CreateCheckoutInput): Promise<CreateCheckoutResult>;
}
