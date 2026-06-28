import type { IcreditIpn } from "@/lib/payments/icredit/types";

function toRecord(raw: Record<string, string> | URLSearchParams): Record<string, string> {
  if (raw instanceof URLSearchParams) {
    const out: Record<string, string> = {};
    for (const [k, v] of raw.entries()) out[k] = v;
    return out;
  }
  return raw;
}

export function parseIpn(raw: Record<string, string> | URLSearchParams): IcreditIpn {
  const rec = toRecord(raw);
  const lower = new Map<string, string>();
  for (const [k, v] of Object.entries(rec)) lower.set(k.toLowerCase(), v);
  const get = (k: string): string | null => lower.get(k.toLowerCase()) ?? null;
  const num = (k: string): number | null => {
    const v = get(k);
    if (v == null || v.trim() === "") return null;
    const n = Number(v);
    return Number.isFinite(n) ? n : null;
  };
  return {
    saleId: get("SaleId"),
    groupPrivateToken: get("GroupPrivateToken"),
    transactionAmount: num("TransactionAmount"),
    orderId: get("Custom1"),
    documentUrl: get("DocumentURL"),
    documentNumber: get("DocumentNum"),
    documentType: get("DocumentType"),
    authNum: get("TransactionAuthNum"),
    raw: rec,
  };
}
