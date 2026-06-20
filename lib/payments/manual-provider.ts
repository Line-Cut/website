import type { PaymentProvider } from "@/lib/payments/provider";

export const manualPaymentProvider: PaymentProvider = {
  async createCharge() {
    return { status: "awaiting_payment" };
  },
};
