import type { IcreditConfig } from "@/lib/payments/icredit/config";
import type { PaymentProvider, CreateCheckoutInput, CreateCheckoutResult } from "@/lib/payments/provider";
import { agorotToShekels } from "@/lib/payments/icredit/money";
import { requestPaymentPage, type Fetcher } from "@/lib/payments/icredit/client";

export function createIcreditProvider(deps: { config: IcreditConfig; fetcher?: Fetcher }): PaymentProvider {
  return {
    async createCheckout(input: CreateCheckoutInput): Promise<CreateCheckoutResult> {
      const { host, token } = deps.config;
      if (!host || !token) return { status: "failed", reason: "icredit_not_configured" };

      const body: Record<string, unknown> = {
        GroupPrivateToken: token,
        Items: input.items.map((it) => ({
          Id: 0,
          CatalogNumber: it.catalogNumber ?? "",
          UnitPrice: agorotToShekels(it.unitPrice),
          Quantity: it.quantity,
          Description: it.description,
        })),
        RedirectURL: input.redirectUrl,
        IPNURL: input.ipnUrl,
        DocumentLanguage: input.locale,
        ExemptVAT: false,
        HideItemList: false,
        Custom1: input.orderId,
        Order: input.orderId,
        EmailAddress: input.customer.email,
        CustomerFirstName: input.customer.firstName,
        CustomerLastName: input.customer.lastName,
        PhoneNumber: input.customer.phone,
        Address: input.customer.address ?? "",
        City: input.customer.city ?? "",
        Zipcode: input.customer.postalCode ?? "",
      };

      const res = await requestPaymentPage({ host, body }, deps.fetcher);
      if (res.Status === 0 && res.URL) {
        return { status: "redirect", url: res.URL, reference: res.PublicSaleToken ?? "" };
      }
      return { status: "failed", reason: res.DebugMessage || "geturl_failed" };
    },
  };
}
