import type { Fetcher } from "@/lib/payments/icredit/client";

export type RivhitEnvelope = {
  error_code: number;
  client_message: string;
  debug_message: string;
  data: unknown;
};

const RIVHIT_BASE = "https://api.rivhit.co.il/online/RivhitOnlineAPI.svc";

const defaultFetcher: Fetcher = (url, init) => fetch(url, init);

export async function rivhitPost(
  endpoint: string,
  body: Record<string, unknown>,
  fetcher: Fetcher = defaultFetcher,
): Promise<RivhitEnvelope> {
  const url = `${RIVHIT_BASE}/${endpoint}`;
  const res = await fetcher(url, {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify(body),
  });
  return (await res.json()) as RivhitEnvelope;
}
