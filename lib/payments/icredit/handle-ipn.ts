import { parseIpn } from "@/lib/payments/icredit/ipn";
import { amountMatches } from "@/lib/payments/icredit/money";
import type { IcreditConfig } from "@/lib/payments/icredit/config";

export type IpnOrder = { id: string; price_total: number; payment_status: string };

export type HandleIpnDeps = {
  config: IcreditConfig;
  loadOrder: (orderId: string) => Promise<IpnOrder | null>;
  verify: (saleId: string, totalShekels: number) => Promise<string>;
  finalize: (args: {
    orderId: string;
    saleId: string;
    reference: string | null;
    paidAtISO: string;
    receiptDocumentUrl: string | null;
    receiptDocumentNumber: string | null;
  }) => Promise<{ ok: boolean }>;
  issueFallbackReceipt?: (order: IpnOrder) => Promise<{ documentUrl: string; documentNumber: string } | null>;
  now?: () => string;
};

export async function handleIcreditIpn(
  raw: Record<string, string> | URLSearchParams,
  deps: HandleIpnDeps,
): Promise<{ status: number; body: string }> {
  const now = deps.now ?? (() => new Date().toISOString());

  // 1. Parse and check token. Reject when the configured token is missing/empty
  // (mock or misconfigured mode) so a token-less IPN cannot satisfy null === null.
  const ipn = parseIpn(raw);
  if (!deps.config.token || ipn.groupPrivateToken !== deps.config.token) {
    return { status: 400, body: "bad_token" };
  }

  // 2. Require essential fields
  if (ipn.orderId == null || ipn.saleId == null || ipn.transactionAmount == null) {
    return { status: 400, body: "malformed" };
  }

  // 3. Load order
  const order = await deps.loadOrder(ipn.orderId);
  if (order == null) {
    return { status: 404, body: "order_not_found" };
  }

  // 4. Idempotency check
  if (order.payment_status === "paid") {
    return { status: 200, body: "already_paid" };
  }

  // 5. Verify sale with gateway
  const verifyStatus = await deps.verify(ipn.saleId, ipn.transactionAmount);
  if (verifyStatus !== "VERIFIED") {
    return { status: 400, body: "not_verified" };
  }

  // 6. Amount match
  if (!amountMatches(ipn.transactionAmount, order.price_total)) {
    return { status: 400, body: "amount_mismatch" };
  }

  // 7. Resolve receipt document
  let documentUrl: string | null = ipn.documentUrl;
  let documentNumber: string | null = ipn.documentNumber;

  if (documentUrl == null && deps.issueFallbackReceipt != null) {
    const fallback = await deps.issueFallbackReceipt(order);
    if (fallback != null) {
      documentUrl = fallback.documentUrl;
      documentNumber = fallback.documentNumber;
    }
  }

  // 8. Finalize
  const r = await deps.finalize({
    orderId: ipn.orderId,
    saleId: ipn.saleId,
    reference: ipn.authNum ?? ipn.saleId,
    paidAtISO: now(),
    receiptDocumentUrl: documentUrl,
    receiptDocumentNumber: documentNumber,
  });

  if (!r.ok) {
    return { status: 500, body: "finalize_failed" };
  }

  // 9. Success
  return { status: 200, body: "ok" };
}
