vi.mock("server-only", () => ({}));

import { describe, it, expect, vi } from "vitest";
import { buildDocumentNewBody } from "@/lib/payments/rivhit/issue-receipt";

describe("buildDocumentNewBody", () => {
  it("builds a חשבונית מס קבלה (type 2) with idempotency + payments", () => {
    const body = buildDocumentNewBody({
      apiToken: "TKN",
      orderId: "o1",
      customer: { firstName: "Dana", lastName: "Cohen" },
      lines: [{ description: "Sticker", unitPriceShekels: 12.34, quantity: 2 }],
      totalShekels: 24.68,
      paymentType: 3,
      language: "he",
    });
    expect(body).toMatchObject({
      api_token: "TKN",
      document_type: 2,
      price_include_vat: true,
      request_reference: "o1",
      prevent_duplicates: true,
      language: "he",
      first_name: "Dana",
      last_name: "Cohen",
      items: [{ description: "Sticker", price_nis: 12.34, quantity: 2 }],
      payments: [{ payment_type: 3, amount_nis: 24.68 }],
    });
  });
});
