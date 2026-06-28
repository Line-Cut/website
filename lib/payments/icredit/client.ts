import type { GetUrlResponse } from "@/lib/payments/icredit/types";

export type Fetcher = (
  url: string,
  init: RequestInit,
) => Promise<{ ok: boolean; status: number; json: () => Promise<unknown> }>;

const defaultFetcher: Fetcher = (url, init) => fetch(url, init);

async function postJson(
  url: string,
  body: unknown,
  fetcher: Fetcher,
): Promise<{ ok: boolean; status: number; json: () => Promise<unknown> }> {
  return fetcher(url, {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify(body),
  });
}

export async function requestPaymentPage(
  args: { host: string; body: Record<string, unknown> },
  fetcher: Fetcher = defaultFetcher,
): Promise<GetUrlResponse> {
  const url = `${args.host}/API/PaymentPageRequest.svc/GetUrl`;
  const res = await postJson(url, args.body, fetcher);
  if (!res.ok) {
    return { Status: -1, DebugMessage: `http_${res.status}` } as GetUrlResponse;
  }
  return (await res.json()) as GetUrlResponse;
}

export async function verifySale(
  args: { host: string; token: string; saleId: string; totalAmountShekels: number },
  fetcher: Fetcher = defaultFetcher,
): Promise<string> {
  const url = `${args.host}/API/PaymentPageRequest.svc/Verify`;
  const res = await postJson(
    url,
    { GroupPrivateToken: args.token, SaleId: args.saleId, TotalAmount: args.totalAmountShekels },
    fetcher,
  );
  if (!res.ok) return "ERROR";
  const data = (await res.json()) as { Status?: string };
  return data.Status ?? "ERROR";
}
