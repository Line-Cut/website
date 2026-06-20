/** Amount is in minor units (e.g. agorot for ILS). */
export type PaymentIntent = {
  orderId: string;
  amount: number;
  currency: string;
};

export type PaymentResult =
  | { status: "awaiting_payment"; reference?: string }
  | { status: "paid"; reference: string }
  | { status: "failed"; reason: string };

export interface PaymentProvider {
  createCharge(intent: PaymentIntent): Promise<PaymentResult>;
}
