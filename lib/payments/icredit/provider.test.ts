import { describe, it, expect } from "vitest";
import { createIcreditProvider } from "@/lib/payments/icredit/provider";
import type { CreateCheckoutInput } from "@/lib/payments/provider";

const INPUT: CreateCheckoutInput = {
  orderId: "ord-1", amount: 12345, currency: "ILS", locale: "he",
  items: [{ description: "Sticker pack", catalogNumber: "SKU1", unitPrice: 12345, quantity: 1 }],
  customer: { firstName: "Dana", lastName: "Cohen", email: "d@e.f", phone: "0501112222",
              address: "Herzl 1", city: "Tel Aviv", postalCode: "61000" },
  redirectUrl: "https://site/he/store/track/gt", ipnUrl: "https://site/api/payments/icredit/ipn",
};

function fakeFetcher(captured: { url?: string; body: Record<string, unknown> }, response: unknown) {
  return async (url: string, init: RequestInit) => {
    captured.url = url;
    captured.body = JSON.parse(String(init.body));
    return { ok: true, status: 200, json: async () => response };
  };
}

describe("createIcreditProvider.createCheckout", () => {
  it("posts a server-priced GetUrl request and returns the redirect URL", async () => {
    const captured: { url?: string; body: Record<string, unknown> } = { body: {} };
    const provider = createIcreditProvider({
      config: { mode: "test", host: "https://testicredit.rivhit.co.il", token: "TOKEN" },
      fetcher: fakeFetcher(captured, {
        Status: 0, URL: "https://testicredit.rivhit.co.il/payment/PaymentItems.aspx?Token=abc",
        PublicSaleToken: "pub-1", PrivateSaleToken: "priv-1", DebugMessage: null,
      }),
    });
    const result = await provider.createCheckout(INPUT);
    expect(result).toEqual({
      status: "redirect",
      url: "https://testicredit.rivhit.co.il/payment/PaymentItems.aspx?Token=abc",
      reference: "pub-1",
    });
    expect(captured.url).toBe("https://testicredit.rivhit.co.il/API/PaymentPageRequest.svc/GetUrl");
    expect(captured.body.GroupPrivateToken).toBe("TOKEN");
    expect(captured.body.Custom1).toBe("ord-1");
    expect(captured.body.IPNURL).toBe(INPUT.ipnUrl);
    expect(captured.body.RedirectURL).toBe(INPUT.redirectUrl);
    expect(captured.body.DocumentLanguage).toBe("he");
    expect(captured.body.HideItemList).toBe(false);
    // amount sent in SHEKELS, never agorot:
    expect(captured.body.Items).toEqual([
      { Id: 0, CatalogNumber: "SKU1", UnitPrice: 123.45, Quantity: 1, Description: "Sticker pack" },
    ]);
    expect(captured.body.CustomerFirstName).toBe("Dana");
    expect(captured.body.EmailAddress).toBe("d@e.f");
  });

  it("returns failed when Status is non-zero", async () => {
    const provider = createIcreditProvider({
      config: { mode: "test", host: "https://testicredit.rivhit.co.il", token: "T" },
      fetcher: async () => ({ ok: true, status: 200, json: async () => ({ Status: 5, DebugMessage: "bad token" }) }),
    });
    expect(await provider.createCheckout(INPUT)).toEqual({ status: "failed", reason: "bad token" });
  });

  it("returns failed when the token is missing", async () => {
    const provider = createIcreditProvider({ config: { mode: "test", host: "https://h", token: null } });
    const r = await provider.createCheckout(INPUT);
    expect(r.status).toBe("failed");
  });
});
