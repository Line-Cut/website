import type { GetUrlResponse } from "@/lib/payments/icredit/types";

export type Fetcher = (
  url: string,
  init: RequestInit,
) => Promise<{ ok: boolean; status: number; json: () => Promise<unknown> }>;

const defaultFetcher: Fetcher = (url, init) => fetch(url, init);

async function postJson(url: string, body: unknown, fetcher: Fetcher): Promise<unknown> {
  const res = await fetcher(url, {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify(body),
  });
  return res.json();
}

export async function requestPaymentPage(
  args: { host: string; body: Record<string, unknown> },
  fetcher: Fetcher = defaultFetcher,
): Promise<GetUrlResponse> {
  const url = `${args.host}/API/PaymentPageRequest.svc/GetUrl`;
  return (await postJson(url, args.body, fetcher)) as GetUrlResponse;
}

export async function verifySale(
  args: { host: string; token: string; saleId: string; totalAmountShekels: number },
  fetcher: Fetcher = defaultFetcher,
): Promise<string> {
  const url = `${args.host}/API/PaymentPageRequest.svc/Verify`;
  const res = (await postJson(
    url,
    { GroupPrivateToken: args.token, SaleId: args.saleId, TotalAmount: args.totalAmountShekels },
    fetcher,
  )) as { Status?: string };
  return res.Status ?? "ERROR";
}
