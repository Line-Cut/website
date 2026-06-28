export type IcreditIpn = {
  saleId: string | null;
  groupPrivateToken: string | null;
  transactionAmount: number | null; // shekels
  orderId: string | null;           // our Custom1
  documentUrl: string | null;
  documentNumber: string | null;
  documentType: string | null;
  authNum: string | null;
  raw: Record<string, string>;
};

export type GetUrlResponse = {
  Status: number;
  URL?: string;
  PublicSaleToken?: string;
  PrivateSaleToken?: string;
  DebugMessage?: string | null;
};

export type VerifyResponse = { Status: string };
