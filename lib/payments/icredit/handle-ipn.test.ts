import { describe, it, expect, vi } from "vitest";
import { handleIcreditIpn } from "@/lib/payments/icredit/handle-ipn";

const CONFIG = { mode: "test" as const, host: "https://h", token: "TOK" };
const PAID_IPN = { GroupPrivateToken: "TOK", SaleId: "sale-1", Custom1: "o1",
  TransactionAmount: "123.45", TransactionAuthNum: "auth", DocumentURL: "https://r/d.pdf", DocumentNum: "665" };
const ORDER = { id: "o1", price_total: 12345, payment_status: "awaiting_payment" };

function deps(over = {}) {
  return { config: CONFIG, loadOrder: async () => ORDER, verify: async () => "VERIFIED",
    finalize: vi.fn(async () => ({ ok: true })), now: () => "t", ...over };
}

describe("handleIcreditIpn", () => {
  it("verifies, matches amount, finalizes, 200", async () => {
    const d = deps();
    const res = await handleIcreditIpn(PAID_IPN, d);
    expect(res.status).toBe(200);
    expect(d.finalize).toHaveBeenCalledWith(expect.objectContaining({
      orderId: "o1", saleId: "sale-1", receiptDocumentUrl: "https://r/d.pdf", receiptDocumentNumber: "665" }));
  });
  it("rejects a wrong token (400) and never finalizes", async () => {
    const d = deps();
    const res = await handleIcreditIpn({ ...PAID_IPN, GroupPrivateToken: "NOPE" }, d);
    expect(res.status).toBe(400);
    expect(d.finalize).not.toHaveBeenCalled();
  });
  it("rejects NOTVERIFIED (400)", async () => {
    const d = deps({ verify: async () => "NOTVERIFIED" });
    expect((await handleIcreditIpn(PAID_IPN, d)).status).toBe(400);
    expect(d.finalize).not.toHaveBeenCalled();
  });
  it("rejects an amount mismatch (400)", async () => {
    const d = deps({ loadOrder: async () => ({ ...ORDER, price_total: 99999 }) });
    expect((await handleIcreditIpn(PAID_IPN, d)).status).toBe(400);
  });
  it("is idempotent for an already-paid order (200, no finalize)", async () => {
    const d = deps({ loadOrder: async () => ({ ...ORDER, payment_status: "paid" }) });
    expect((await handleIcreditIpn(PAID_IPN, d)).status).toBe(200);
    expect(d.finalize).not.toHaveBeenCalled();
  });
  it("uses the fallback issuer when the IPN carries no document", async () => {
    const issue = vi.fn(async () => ({ documentUrl: "https://r/fb.pdf", documentNumber: "777" }));
    const d = deps({ issueFallbackReceipt: issue });
    const noDoc = { ...PAID_IPN }; delete (noDoc as Record<string, unknown>).DocumentURL; delete (noDoc as Record<string, unknown>).DocumentNum;
    await handleIcreditIpn(noDoc, d);
    expect(issue).toHaveBeenCalled();
    expect(d.finalize).toHaveBeenCalledWith(expect.objectContaining({ receiptDocumentUrl: "https://r/fb.pdf" }));
  });
});
