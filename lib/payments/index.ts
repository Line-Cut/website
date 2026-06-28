import type { PaymentProvider } from "@/lib/payments/provider";
import { manualPaymentProvider } from "@/lib/payments/manual-provider";
import { getIcreditConfig } from "@/lib/payments/icredit/config";
import { createIcreditProvider } from "@/lib/payments/icredit/provider";

/** Single seam — choose the gateway by env. Mock unless ICREDIT_MODE is test/prod. */
export function getPaymentProvider(): PaymentProvider {
  const config = getIcreditConfig();
  if (config.mode === "mock") return manualPaymentProvider;
  return createIcreditProvider({ config });
}
