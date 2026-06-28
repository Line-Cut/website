import { describe, it, expect } from "vitest";
import { parseIpn } from "@/lib/payments/icredit/ipn";

describe("parseIpn", () => {
  it("reads known fields case-insensitively from a record", () => {
    const ipn = parseIpn({
      SaleId: "sale-1", GroupPrivateToken: "tok", TransactionAmount: "123.45",
      Custom1: "order-9", DocumentURL: "https://r/doc.pdf", DocumentNum: "665",
      DocumentType: "2", TransactionAuthNum: "auth-7",
    });
    expect(ipn.saleId).toBe("sale-1");
    expect(ipn.orderId).toBe("order-9");
    expect(ipn.transactionAmount).toBe(123.45);
    expect(ipn.documentUrl).toBe("https://r/doc.pdf");
    expect(ipn.documentNumber).toBe("665");
    expect(ipn.authNum).toBe("auth-7");
  });
  it("tolerates lowercase / alternate casing", () => {
    const ipn = parseIpn({ saleid: "s", custom1: "o", transactionamount: "5.00" });
    expect(ipn.saleId).toBe("s");
    expect(ipn.orderId).toBe("o");
    expect(ipn.transactionAmount).toBe(5);
  });
  it("accepts URLSearchParams and defaults missing fields to null", () => {
    const ipn = parseIpn(new URLSearchParams("SaleId=s&Custom1=o"));
    expect(ipn.saleId).toBe("s");
    expect(ipn.transactionAmount).toBeNull();
    expect(ipn.documentUrl).toBeNull();
  });
});
