import type { PaymentProvider } from "@/lib/payments/provider";
import { manualPaymentProvider } from "@/lib/payments/manual-provider";

/** Single seam — swap in a real gateway later by changing this one function. */
export function getPaymentProvider(): PaymentProvider {
  return manualPaymentProvider;
}
