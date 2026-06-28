import type { PaymentProvider } from "@/lib/payments/provider";

/**
 * Mock provider — payment is simulated as SUCCESSFUL (no redirect) so the
 * sticker flow and store-mock path finalize inline end-to-end. No real charge.
 * Swap to iCredit by setting ICREDIT_MODE in lib/payments/index.ts.
 */
export const manualPaymentProvider: PaymentProvider = {
  async createCheckout(input) {
    return { status: "paid", reference: `MOCK-${input.orderId}` };
  },
};
