import type { PaymentProvider } from "@/lib/payments/provider";

/**
 * Mock provider — payment is simulated as SUCCESSFUL so the full post-payment
 * pipeline (copy to the paid bucket + receipt) runs end-to-end while the real
 * (non-standard) payment solution is still pending. No real charge happens.
 * Swap this out in `lib/payments/index.ts` when the real gateway is ready.
 */
export const manualPaymentProvider: PaymentProvider = {
  async createCharge(intent) {
    return { status: "paid", reference: `MOCK-${intent.orderId}` };
  },
};
