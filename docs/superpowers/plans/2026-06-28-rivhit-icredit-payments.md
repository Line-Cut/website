# Rivhit / iCredit Payment Integration — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Charge the server-computed store-cart total via the iCredit hosted payment page (redirect), confirm payment through an IPN webhook with a Verify call + amount re-check, and record the receipt iCredit issues — wired to the iCredit **test** sandbox and switchable to prod by env.

**Architecture:** Evolve the existing `PaymentProvider` seam from a synchronous `createCharge` into a hosted-checkout `createCheckout` that returns either a `redirect` URL (iCredit) or `paid` (mock). A single idempotent `finalizePaidOrder` core is the only path that flips a store order to paid; it is called by the mock's inline path and by the new `app/api/payments/icredit/ipn` webhook. iCredit's hosted page guarantees the buyer can't alter line items/amount: the cart is re-priced server-side, the GetUrl call is server-to-server, and the IPN amount is re-verified before finalize.

**Tech Stack:** Next.js 16 App Router, TypeScript, Vitest (jsdom, globals), Supabase (service-role admin client), Zod. Money is integer **agorot** internally; iCredit speaks **shekels (2-decimal)** — convert only at the iCredit edge.

## Confirmed external API contracts (probed against the test sandbox 2026-06-28 — do NOT re-probe)

**GetUrl** — `POST https://{host}/API/PaymentPageRequest.svc/GetUrl`, JSON.
Request (fields we send): `GroupPrivateToken` (GUID), `Items:[{Id:0,CatalogNumber,UnitPrice,Quantity,Description}]` (UnitPrice/amounts in **shekels**), `RedirectURL`, `IPNURL`, `DocumentLanguage` ("he"|"en"), `ExemptVAT` (bool), `HideItemList` (bool), `Custom1` (=our orderId), `EmailAddress`, `CustomerFirstName`, `CustomerLastName`, `PhoneNumber`, `Address`, `City`, `Zipcode`.
Response (confirmed shape):
```json
{ "Status": 0, "URL": "https://testicredit.rivhit.co.il/payment/PaymentItems.aspx?GroupId=...&Token=...",
  "PublicSaleToken": "<guid>", "PrivateSaleToken": "<guid>", "DebugMessage": null }
```
`Status === 0` ⇒ success, redirect to `URL`. Non-zero or missing `URL` ⇒ failure (`DebugMessage` carries the reason).

**Verify** — `POST https://{host}/API/PaymentPageRequest.svc/Verify`, JSON.
Request: `{ "GroupPrivateToken": "<guid>", "SaleId": "<guid>", "TotalAmount": <shekels-decimal> }`.
Response (confirmed shape): `{ "Status": "VERIFIED" }` on a real paid sale; `{ "Status": "NOTVERIFIED" }` otherwise. HTTP 200 either way.

**Hosts:** test `https://testicredit.rivhit.co.il`, prod `https://icredit.rivhit.co.il`.

**IPN** (iCredit → our `IPNURL`, HTTP POST **form-encoded**): keys include `SaleId`, `GroupPrivateToken`, `TransactionAmount` (shekels), `Custom1` (our orderId), `TransactionAuthNum`, and — when the account auto-issues — `DocumentURL`, `DocumentNum`, `DocumentType`. The exact key **casing** from a live IPN is unverified, so the parser MUST look keys up case-insensitively.

**Rivhit REST (fallback only):** `POST https://api.rivhit.co.il/online/RivhitOnlineAPI.svc/Document.New`, body `{api_token, document_type:2, price_include_vat:true, customer_id|overload fields, items:[{description,price_nis,quantity}], payments:[{payment_type,amount_nis}], request_reference, prevent_duplicates:true, language, send_mail}`. Envelope `{error_code, client_message, data:{document_number, document_link, ...}}`, `error_code===0` = success.

## Global Constraints

- **Money:** integers in **agorot** everywhere internally (DB `price_*`, intents). Convert to shekels (`agorot/100`, 2-decimal) ONLY when building an iCredit/Rivhit request; convert back (`Math.round(shekels*100)`) when reading the IPN. Never store/compare shekel floats.
- **Buyer cannot alter items/amount (the user's hard requirement):** cart re-priced server-side via `computeStoreTotals`; GetUrl called server-to-server; IPN `TransactionAmount` re-checked `=== order.price_total` before finalize. A mismatch ⇒ webhook returns non-2xx and the order is NOT marked paid.
- **Webhook trust:** never trust the IPN POST for payment truth. `Verify` (`Status === "VERIFIED"`) is the source of truth; dedupe on `provider_sale_id`.
- **Idempotency:** `finalizePaidOrder` is a no-op when the order is already paid; the webhook returns 200 for an already-processed sale.
- **Pattern:** pure logic + DI cores (`deps` object) + thin `"use server"` / route wrappers. Secrets server-only. Test files colocated `*.test.ts`. Each test file starts with `vi.mock("server-only", () => ({}))` when it imports a `server-only` module.
- **Sticker flow stays on the mock and behaves exactly as today.** Only the one `paymentProvider` call site in `lib/orders/confirm-order.ts` is adapted to the new method name; its finalization stays inline.
- **Commits on this machine:** prefix git with `GIT_CONFIG_GLOBAL=/dev/null` (broken global `gpg.format`). End commit messages with the `Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>` trailer.
- **Env:** `ICREDIT_MODE` (`mock` default | `test` | `prod`), `ICREDIT_GROUP_PRIVATE_TOKEN`, `RIVHIT_API_TOKEN`, `RIVHIT_RECEIPT_FALLBACK` (`"on"` to enable), `RIVHIT_RECEIPT_PAYMENT_TYPE` (int, default `3`), existing `NEXT_PUBLIC_SITE_URL`. Sandbox test token: `80d75f51-1ca1-41a8-a698-8183d68499c6`; test card `4580000000000000` / CVV `111` / ID `123456790`.

## File Structure

| File | Responsibility |
|---|---|
| `supabase/migrations/20260628000000_payment_provider_fields.sql` | Add `payment_provider`, `provider_sale_id` (+ partial unique idx), `receipt_document_url`, `receipt_document_number` to `orders`. |
| `lib/payments/provider.ts` | Evolve contract: `CheckoutLineItem`, `CheckoutCustomer`, `CreateCheckoutInput`, `CreateCheckoutResult`, `PaymentProvider.createCheckout`. |
| `lib/payments/manual-provider.ts` | Mock → `createCheckout` returns `{status:"paid"}`. |
| `lib/payments/index.ts` | `getPaymentProvider()` picks mock vs iCredit by `ICREDIT_MODE`. |
| `lib/payments/icredit/config.ts` | `getIcreditConfig(env)` → `{mode, host, token}` (pure). |
| `lib/payments/icredit/money.ts` | `agorotToShekels`, `shekelsToAgorot`, `amountMatches` (pure). |
| `lib/payments/icredit/ipn.ts` | `parseIpn(raw)` (case-insensitive) → `IcreditIpn` (pure). |
| `lib/payments/icredit/types.ts` | Request/response/IPN TS shapes. |
| `lib/payments/icredit/client.ts` | `requestPaymentPage`, `verifySale` (fetch; DI fetch). |
| `lib/payments/icredit/provider.ts` | `createIcreditProvider(deps)` implementing `PaymentProvider`. |
| `lib/payments/icredit/handle-ipn.ts` | `handleIcreditIpn(raw, deps)` (pure-ish DI core, all branch logic). |
| `lib/payments/rivhit/client.ts` | `rivhitPost(endpoint, body, deps)` envelope helper. |
| `lib/payments/rivhit/issue-receipt.ts` | `buildDocumentNewBody`, `issueInvoiceReceipt` (Document.New type 2, fallback). |
| `lib/orders/finalize-paid-order.ts` | `finalizePaidOrder(input, deps)` — the one idempotent store-order finalize. |
| `lib/store/confirm-store-order.ts` | Use `createCheckout`; return `redirectUrl` on redirect; finalize inline on `paid`; idempotent re-issue. |
| `lib/store/checkout-navigation.ts` | `nextNavigation(result, lang)` pure helper for the client. |
| `app/actions/store.ts` | Thread `locale`, inject `finalizePaidOrder` + URL builders. |
| `components/store/store-checkout.tsx` | Follow `redirectUrl` via `window.location.assign`. |
| `app/api/payments/icredit/ipn/route.ts` | Thin POST handler → `handleIcreditIpn`. |
| `lib/orders/confirm-order.ts` | Adapt the one `createCharge` → `createCheckout` call site. |
| `.claude/skills/rivhit-icredit/SKILL.md` (+ `references/icredit-fields.md`, `references/rivhit-fields.md`) | The skill. |
| `.claude/skills/sticker-shop/SKILL.md` | Point Payments row at the new skill. |

---

### Task 1: DB migration — payment provider fields

**Files:**
- Create: `supabase/migrations/20260628000000_payment_provider_fields.sql`

**Interfaces:**
- Produces: `orders.payment_provider text`, `orders.provider_sale_id text` (+ partial unique index `orders_provider_sale_id_key`), `orders.receipt_document_url text`, `orders.receipt_document_number text`.

- [ ] **Step 1: Write the migration**

```sql
-- Payment-provider + issued-receipt fields on orders.
-- Additive and nullable: existing rows and the sticker/mock flow are unaffected.
-- Populated by finalizePaidOrder (mock inline) and the iCredit IPN webhook.
alter table orders add column if not exists payment_provider        text;
alter table orders add column if not exists provider_sale_id        text;
alter table orders add column if not exists receipt_document_url    text;
alter table orders add column if not exists receipt_document_number text;

comment on column orders.payment_provider is
  'Payment provider that settled this order, e.g. "icredit" or "mock".';
comment on column orders.provider_sale_id is
  'iCredit SaleId (or other provider sale id). Unique when set — the webhook dedupe key.';
comment on column orders.receipt_document_url is
  'URL of the tax receipt (חשבונית מס קבלה) issued by iCredit/Rivhit at payment.';
comment on column orders.receipt_document_number is
  'Human-facing document number of the issued receipt.';

-- One provider sale id maps to at most one order (idempotent webhook + anti-replay).
create unique index if not exists orders_provider_sale_id_key
  on orders (provider_sale_id)
  where provider_sale_id is not null;
```

- [ ] **Step 2: Lint the SQL (best-effort; offline-friendly)**

Run: `npx --yes supabase db lint --help >/dev/null 2>&1 && echo "cli-ok" || echo "cli-skip"`
Expected: prints `cli-ok` or `cli-skip`. Do a careful manual read of the SQL regardless. (Applying it needs `npm run db:push` against the project DB — that is a deploy/manual step, NOT part of this task.)

- [ ] **Step 3: Commit**

```bash
GIT_CONFIG_GLOBAL=/dev/null git add supabase/migrations/20260628000000_payment_provider_fields.sql
GIT_CONFIG_GLOBAL=/dev/null git commit -m "feat(db): add payment provider + receipt fields to orders

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 2: iCredit config resolver (pure)

**Files:**
- Create: `lib/payments/icredit/config.ts`
- Test: `lib/payments/icredit/config.test.ts`

**Interfaces:**
- Produces:
  - `type IcreditMode = "mock" | "test" | "prod"`
  - `type IcreditConfig = { mode: IcreditMode; host: string | null; token: string | null }`
  - `function getIcreditConfig(env?: Record<string, string | undefined>): IcreditConfig` (defaults to `process.env`)

- [ ] **Step 1: Write the failing test**

```ts
import { describe, it, expect } from "vitest";
import { getIcreditConfig } from "@/lib/payments/icredit/config";

describe("getIcreditConfig", () => {
  it("defaults to mock when ICREDIT_MODE is unset", () => {
    expect(getIcreditConfig({})).toEqual({ mode: "mock", host: null, token: null });
  });
  it("resolves the test host and token", () => {
    expect(
      getIcreditConfig({ ICREDIT_MODE: "test", ICREDIT_GROUP_PRIVATE_TOKEN: "tok" }),
    ).toEqual({ mode: "test", host: "https://testicredit.rivhit.co.il", token: "tok" });
  });
  it("resolves the prod host", () => {
    expect(getIcreditConfig({ ICREDIT_MODE: "prod", ICREDIT_GROUP_PRIVATE_TOKEN: "p" }).host)
      .toBe("https://icredit.rivhit.co.il");
  });
  it("treats an unknown mode as mock", () => {
    expect(getIcreditConfig({ ICREDIT_MODE: "weird" }).mode).toBe("mock");
  });
});
```

- [ ] **Step 2: Run it, verify it fails**

Run: `npm test -- lib/payments/icredit/config.test.ts`
Expected: FAIL (module not found).

- [ ] **Step 3: Implement**

```ts
export type IcreditMode = "mock" | "test" | "prod";
export type IcreditConfig = { mode: IcreditMode; host: string | null; token: string | null };

const HOSTS: Record<"test" | "prod", string> = {
  test: "https://testicredit.rivhit.co.il",
  prod: "https://icredit.rivhit.co.il",
};

export function getIcreditConfig(
  env: Record<string, string | undefined> = process.env,
): IcreditConfig {
  const raw = env.ICREDIT_MODE;
  const mode: IcreditMode = raw === "test" || raw === "prod" ? raw : "mock";
  if (mode === "mock") return { mode, host: null, token: null };
  return { mode, host: HOSTS[mode], token: env.ICREDIT_GROUP_PRIVATE_TOKEN ?? null };
}
```

- [ ] **Step 4: Run it, verify it passes**

Run: `npm test -- lib/payments/icredit/config.test.ts`
Expected: PASS (4/4).

- [ ] **Step 5: Commit**

```bash
GIT_CONFIG_GLOBAL=/dev/null git add lib/payments/icredit/config.ts lib/payments/icredit/config.test.ts
GIT_CONFIG_GLOBAL=/dev/null git commit -m "feat(payments): iCredit config resolver

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 3: Money conversion + IPN parsing (pure)

**Files:**
- Create: `lib/payments/icredit/money.ts`, `lib/payments/icredit/ipn.ts`, `lib/payments/icredit/types.ts`
- Test: `lib/payments/icredit/money.test.ts`, `lib/payments/icredit/ipn.test.ts`

**Interfaces:**
- Produces (`money.ts`): `agorotToShekels(a:number):number`, `shekelsToAgorot(s:number):number`, `amountMatches(transactionAmountShekels:number, orderTotalAgorot:number):boolean`.
- Produces (`types.ts`):
  - `type IcreditIpn = { saleId: string|null; groupPrivateToken: string|null; transactionAmount: number|null; orderId: string|null; documentUrl: string|null; documentNumber: string|null; documentType: string|null; authNum: string|null; raw: Record<string,string> }`
- Produces (`ipn.ts`): `parseIpn(raw: Record<string,string> | URLSearchParams): IcreditIpn`.

- [ ] **Step 1: Write the failing tests**

`money.test.ts`:
```ts
import { describe, it, expect } from "vitest";
import { agorotToShekels, shekelsToAgorot, amountMatches } from "@/lib/payments/icredit/money";

describe("money", () => {
  it("agorot → shekels (2-decimal)", () => {
    expect(agorotToShekels(12345)).toBe(123.45);
    expect(agorotToShekels(100)).toBe(1);
    expect(agorotToShekels(0)).toBe(0);
  });
  it("shekels → agorot (rounds)", () => {
    expect(shekelsToAgorot(123.45)).toBe(12345);
    expect(shekelsToAgorot(1)).toBe(100);
    expect(shekelsToAgorot(0.1 + 0.2)).toBe(30); // float-safe
  });
  it("amountMatches compares shekels-IPN to agorot-order", () => {
    expect(amountMatches(123.45, 12345)).toBe(true);
    expect(amountMatches(123.44, 12345)).toBe(false);
  });
});
```

`ipn.test.ts`:
```ts
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
```

- [ ] **Step 2: Run them, verify they fail**

Run: `npm test -- lib/payments/icredit/money.test.ts lib/payments/icredit/ipn.test.ts`
Expected: FAIL (modules not found).

- [ ] **Step 3: Implement**

`money.ts`:
```ts
export function agorotToShekels(a: number): number {
  return Math.round(a) / 100;
}
export function shekelsToAgorot(s: number): number {
  return Math.round(s * 100);
}
export function amountMatches(transactionAmountShekels: number, orderTotalAgorot: number): boolean {
  return shekelsToAgorot(transactionAmountShekels) === orderTotalAgorot;
}
```

`types.ts`:
```ts
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
```

`ipn.ts`:
```ts
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
```

- [ ] **Step 4: Run them, verify they pass**

Run: `npm test -- lib/payments/icredit/money.test.ts lib/payments/icredit/ipn.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
GIT_CONFIG_GLOBAL=/dev/null git add lib/payments/icredit/money.ts lib/payments/icredit/money.test.ts lib/payments/icredit/ipn.ts lib/payments/icredit/ipn.test.ts lib/payments/icredit/types.ts
GIT_CONFIG_GLOBAL=/dev/null git commit -m "feat(payments): iCredit money + IPN parsing

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 4: Evolve the PaymentProvider contract + conform the mock

**Files:**
- Modify: `lib/payments/provider.ts` (replace contents)
- Modify: `lib/payments/manual-provider.ts`
- Modify: `lib/payments/manual-provider.test.ts`

**Interfaces:**
- Produces:
  - `type CheckoutLineItem = { description: string; catalogNumber: string | null; unitPrice: number; quantity: number }` (unitPrice in agorot)
  - `type CheckoutCustomer = { firstName: string; lastName: string; email: string; phone: string; address?: string | null; city?: string | null; postalCode?: string | null }`
  - `type CreateCheckoutInput = { orderId: string; amount: number; currency: string; locale: "he"|"en"; items: CheckoutLineItem[]; customer: CheckoutCustomer; redirectUrl: string; ipnUrl: string }`
  - `type CreateCheckoutResult = { status:"redirect"; url:string; reference:string } | { status:"paid"; reference:string } | { status:"failed"; reason:string }`
  - `interface PaymentProvider { createCheckout(input: CreateCheckoutInput): Promise<CreateCheckoutResult> }`

- [ ] **Step 1: Update the mock test (failing)**

Replace `lib/payments/manual-provider.test.ts` body with:
```ts
import { describe, it, expect } from "vitest";
import { manualPaymentProvider } from "@/lib/payments/manual-provider";
import { getPaymentProvider } from "@/lib/payments/index";
import type { CreateCheckoutInput } from "@/lib/payments/provider";

const INPUT: CreateCheckoutInput = {
  orderId: "o1", amount: 5000, currency: "ILS", locale: "he",
  items: [{ description: "X", catalogNumber: null, unitPrice: 5000, quantity: 1 }],
  customer: { firstName: "A", lastName: "B", email: "a@b.c", phone: "0500000000" },
  redirectUrl: "https://site/thanks", ipnUrl: "https://site/ipn",
};

describe("manualPaymentProvider", () => {
  it("createCheckout returns paid with a mock reference", async () => {
    expect(await manualPaymentProvider.createCheckout(INPUT)).toEqual({
      status: "paid", reference: "MOCK-o1",
    });
  });
});

describe("getPaymentProvider", () => {
  it("returns a provider exposing createCheckout", () => {
    expect(typeof getPaymentProvider().createCheckout).toBe("function");
  });
});
```

- [ ] **Step 2: Run it, verify it fails**

Run: `npm test -- lib/payments/manual-provider.test.ts`
Expected: FAIL (type/method mismatch).

- [ ] **Step 3: Rewrite `provider.ts`**

```ts
/** unitPrice/amount are in minor units (agorot for ILS). */
export type CheckoutLineItem = {
  description: string;
  catalogNumber: string | null;
  unitPrice: number;
  quantity: number;
};
export type CheckoutCustomer = {
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  address?: string | null;
  city?: string | null;
  postalCode?: string | null;
};
export type CreateCheckoutInput = {
  orderId: string;
  amount: number;
  currency: string;
  locale: "he" | "en";
  items: CheckoutLineItem[];
  customer: CheckoutCustomer;
  redirectUrl: string;
  ipnUrl: string;
};
export type CreateCheckoutResult =
  | { status: "redirect"; url: string; reference: string }
  | { status: "paid"; reference: string }
  | { status: "failed"; reason: string };

export interface PaymentProvider {
  createCheckout(input: CreateCheckoutInput): Promise<CreateCheckoutResult>;
}
```

- [ ] **Step 4: Rewrite `manual-provider.ts`**

```ts
import type { PaymentProvider } from "@/lib/payments/provider";

/**
 * Mock provider — payment is simulated as SUCCESSFUL (no redirect) so the
 * sticker flow and store-mock path finalize inline end-to-end. No real charge.
 * Swap to iCredit by setting ICREDIT_MODE in lib/payments/index.ts.
 */
export const manualPaymentProvider: PaymentProvider = {
  async createCheckout(input) {
    return { status: "paid", reference: `MOCK-${input.orderId}` };
  },
};
```

- [ ] **Step 5: Run tests (will still fail until index.ts in Task 6)**

Run: `npm test -- lib/payments/manual-provider.test.ts`
Expected: the `manualPaymentProvider` test PASSES; the `getPaymentProvider` test may FAIL only if `index.ts` still references `createCharge`. If so, this task may be committed together with Task 6, OR temporarily update `index.ts` is out of scope here — proceed to Step 6 and let Task 6 finish the suite. (Run `npx tsc --noEmit` to confirm `provider.ts`/`manual-provider.ts` typecheck.)

Run: `npx tsc --noEmit 2>&1 | grep -E "payments/(provider|manual-provider)" || echo "provider+mock typecheck clean"`
Expected: `provider+mock typecheck clean`.

- [ ] **Step 6: Commit**

```bash
GIT_CONFIG_GLOBAL=/dev/null git add lib/payments/provider.ts lib/payments/manual-provider.ts lib/payments/manual-provider.test.ts
GIT_CONFIG_GLOBAL=/dev/null git commit -m "feat(payments): evolve PaymentProvider to hosted createCheckout

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

> NOTE to implementer: Tasks 4, 5, 6 together leave the repo green. The full suite is expected to compile only after Task 6 wires `index.ts` and Tasks 8/confirm-order adapt the call sites. The task reviewer for Task 4 should verify the two rewritten files in isolation (types + mock behavior), not the whole suite.

---

### Task 5: iCredit client + provider

**Files:**
- Create: `lib/payments/icredit/client.ts`, `lib/payments/icredit/provider.ts`
- Test: `lib/payments/icredit/provider.test.ts`

**Interfaces:**
- Consumes: `getIcreditConfig`, money helpers, `types.ts`, `PaymentProvider`/`CreateCheckoutInput`/`CreateCheckoutResult`.
- Produces (`client.ts`):
  - `type Fetcher = (url: string, init: RequestInit) => Promise<{ ok: boolean; status: number; json: () => Promise<unknown> }>`
  - `requestPaymentPage(args: { host: string; body: Record<string, unknown> }, fetcher?: Fetcher): Promise<GetUrlResponse>`
  - `verifySale(args: { host: string; token: string; saleId: string; totalAmountShekels: number }, fetcher?: Fetcher): Promise<string>` (returns the `Status` string)
- Produces (`provider.ts`): `createIcreditProvider(deps: { config: IcreditConfig; fetcher?: Fetcher }): PaymentProvider`.

- [ ] **Step 1: Write the failing test** (`provider.test.ts`)

```ts
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

function fakeFetcher(captured: { url?: string; body?: any }, response: unknown) {
  return async (url: string, init: RequestInit) => {
    captured.url = url;
    captured.body = JSON.parse(String(init.body));
    return { ok: true, status: 200, json: async () => response };
  };
}

describe("createIcreditProvider.createCheckout", () => {
  it("posts a server-priced GetUrl request and returns the redirect URL", async () => {
    const captured: { url?: string; body?: any } = {};
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
```

- [ ] **Step 2: Run it, verify it fails**

Run: `npm test -- lib/payments/icredit/provider.test.ts`
Expected: FAIL (modules not found).

- [ ] **Step 3: Implement `client.ts`**

```ts
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
```

- [ ] **Step 4: Implement `provider.ts`**

```ts
import type { IcreditConfig } from "@/lib/payments/icredit/config";
import type { PaymentProvider, CreateCheckoutInput, CreateCheckoutResult } from "@/lib/payments/provider";
import { agorotToShekels } from "@/lib/payments/icredit/money";
import { requestPaymentPage, type Fetcher } from "@/lib/payments/icredit/client";

export function createIcreditProvider(deps: { config: IcreditConfig; fetcher?: Fetcher }): PaymentProvider {
  return {
    async createCheckout(input: CreateCheckoutInput): Promise<CreateCheckoutResult> {
      const { host, token } = deps.config;
      if (!host || !token) return { status: "failed", reason: "icredit_not_configured" };

      const body: Record<string, unknown> = {
        GroupPrivateToken: token,
        Items: input.items.map((it) => ({
          Id: 0,
          CatalogNumber: it.catalogNumber ?? "",
          UnitPrice: agorotToShekels(it.unitPrice),
          Quantity: it.quantity,
          Description: it.description,
        })),
        RedirectURL: input.redirectUrl,
        IPNURL: input.ipnUrl,
        DocumentLanguage: input.locale,
        ExemptVAT: false,
        HideItemList: false,
        Custom1: input.orderId,
        Order: input.orderId,
        EmailAddress: input.customer.email,
        CustomerFirstName: input.customer.firstName,
        CustomerLastName: input.customer.lastName,
        PhoneNumber: input.customer.phone,
        Address: input.customer.address ?? "",
        City: input.customer.city ?? "",
        Zipcode: input.customer.postalCode ?? "",
      };

      const res = await requestPaymentPage({ host, body }, deps.fetcher);
      if (res.Status === 0 && res.URL) {
        return { status: "redirect", url: res.URL, reference: res.PublicSaleToken ?? "" };
      }
      return { status: "failed", reason: res.DebugMessage || "geturl_failed" };
    },
  };
}
```

- [ ] **Step 5: Run it, verify it passes**

Run: `npm test -- lib/payments/icredit/provider.test.ts`
Expected: PASS (3/3).

- [ ] **Step 6: Commit**

```bash
GIT_CONFIG_GLOBAL=/dev/null git add lib/payments/icredit/client.ts lib/payments/icredit/provider.ts lib/payments/icredit/provider.test.ts
GIT_CONFIG_GLOBAL=/dev/null git commit -m "feat(payments): iCredit GetUrl/Verify client + provider

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 6: Provider switch by env

**Files:**
- Modify: `lib/payments/index.ts`
- Test: `lib/payments/index.test.ts`

**Interfaces:**
- Consumes: `getIcreditConfig`, `createIcreditProvider`, `manualPaymentProvider`.
- Produces: `getPaymentProvider(): PaymentProvider` (unchanged signature).

- [ ] **Step 1: Write the failing test**

```ts
import { describe, it, expect, afterEach } from "vitest";
import { getPaymentProvider } from "@/lib/payments/index";

const prev = process.env.ICREDIT_MODE;
afterEach(() => { if (prev === undefined) delete process.env.ICREDIT_MODE; else process.env.ICREDIT_MODE = prev; });

describe("getPaymentProvider", () => {
  it("returns a provider with createCheckout in mock mode", () => {
    delete process.env.ICREDIT_MODE;
    expect(typeof getPaymentProvider().createCheckout).toBe("function");
  });
  it("returns an iCredit-backed provider when ICREDIT_MODE=test", () => {
    process.env.ICREDIT_MODE = "test";
    process.env.ICREDIT_GROUP_PRIVATE_TOKEN = "tok";
    expect(typeof getPaymentProvider().createCheckout).toBe("function");
  });
});
```

- [ ] **Step 2: Run it, verify it fails**

Run: `npm test -- lib/payments/index.test.ts`
Expected: FAIL (still references old `createCharge` provider).

- [ ] **Step 3: Implement**

```ts
import type { PaymentProvider } from "@/lib/payments/provider";
import { manualPaymentProvider } from "@/lib/payments/manual-provider";
import { getIcreditConfig } from "@/lib/payments/icredit/config";
import { createIcreditProvider } from "@/lib/payments/icredit/provider";

/** Single seam — choose the gateway by env. Mock unless ICREDIT_MODE is test/prod. */
export function getPaymentProvider(): PaymentProvider {
  const config = getIcreditConfig();
  if (config.mode === "mock") return manualPaymentProvider;
  return createIcreditProvider({ config });
}
```

- [ ] **Step 4: Run it + the mock suite, verify pass**

Run: `npm test -- lib/payments/index.test.ts lib/payments/manual-provider.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
GIT_CONFIG_GLOBAL=/dev/null git add lib/payments/index.ts lib/payments/index.test.ts
GIT_CONFIG_GLOBAL=/dev/null git commit -m "feat(payments): select iCredit vs mock provider by env

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 7: `finalizePaidOrder` core (idempotent store-order finalize)

**Files:**
- Create: `lib/orders/finalize-paid-order.ts`
- Test: `lib/orders/finalize-paid-order.test.ts`

**Interfaces:**
- Produces:
  - `type FinalizePaidOrderInput = { orderId: string; paidAtISO: string; provider: string; saleId: string | null; reference: string | null; receiptDocumentUrl: string | null; receiptDocumentNumber: string | null }`
  - `type FinalizePaidOrderDeps = { admin: SupabaseClient; sendOwnerEmail: (e:{subject:string;text:string;replyTo:string})=>Promise<void>; ownerOrderUrlFor:(id:string)=>string; now?: ()=>string }`
  - `type FinalizePaidOrderResult = { ok: true; alreadyPaid: boolean } | { ok: false; message: string }`
  - `function finalizePaidOrder(input, deps): Promise<FinalizePaidOrderResult>`

**Behavior:**
1. Update `orders` SET payment fields + `confirmed_at = coalesce(confirmed_at, now)` WHERE `id = orderId AND payment_status <> 'paid'`, returning the row. If 0 rows updated → it was already paid ⇒ `{ ok:true, alreadyPaid:true }` (no email).
2. On a real transition: load `order_items`, build the owner email via `buildOwnerStoreEmail`, send best-effort (failure logged, never fails). Only for `order_kind === "store"`.
3. Return `{ ok:true, alreadyPaid:false }`. DB error on the update → `{ ok:false, message:"db_error" }`.

- [ ] **Step 1: Write the failing test**

Use the fake-admin pattern from `lib/orders/confirm-order.test.ts`. The fake `from("orders").update(payload).eq(...).neq(...).select()` returns `{ data: [updatedRow] }` on first call and `{ data: [] }` on a second (simulating already-paid). Assert:
```ts
vi.mock("server-only", () => ({}));
import { describe, it, expect, vi } from "vitest";
import { finalizePaidOrder } from "@/lib/orders/finalize-paid-order";

// Build a fake admin whose orders.update().eq().neq().select() yields `rows`,
// and order_items.select().eq() yields a single line. (Mirror confirm-order.test.ts.)
// ... (implementer writes makeFakeAdmin per the existing pattern) ...

describe("finalizePaidOrder", () => {
  it("marks an awaiting order paid, sets receipt fields + confirmed_at, sends owner email once", async () => {
    const emails: unknown[] = [];
    const admin = makeFakeAdmin({ updatedRows: [STORE_ORDER_ROW], items: [ITEM_ROW] });
    const res = await finalizePaidOrder(
      { orderId: "o1", paidAtISO: "2026-06-28T00:00:00.000Z", provider: "icredit",
        saleId: "sale-1", reference: "auth-7", receiptDocumentUrl: "https://r/d.pdf", receiptDocumentNumber: "665" },
      { admin, sendOwnerEmail: async (e) => { emails.push(e); }, ownerOrderUrlFor: (id) => `https://s/admin/${id}` },
    );
    expect(res).toEqual({ ok: true, alreadyPaid: false });
    const payload = admin._lastOrderUpdate as Record<string, unknown>;
    expect(payload.payment_status).toBe("paid");
    expect(payload.provider_sale_id).toBe("sale-1");
    expect(payload.receipt_document_url).toBe("https://r/d.pdf");
    expect(payload.payment_provider).toBe("icredit");
    expect(emails).toHaveLength(1);
  });

  it("is a no-op when already paid (0 rows updated) and sends no email", async () => {
    const emails: unknown[] = [];
    const admin = makeFakeAdmin({ updatedRows: [] });
    const res = await finalizePaidOrder(
      { orderId: "o1", paidAtISO: "t", provider: "icredit", saleId: "s", reference: null,
        receiptDocumentUrl: null, receiptDocumentNumber: null },
      { admin, sendOwnerEmail: async (e) => { emails.push(e); }, ownerOrderUrlFor: () => "x" },
    );
    expect(res).toEqual({ ok: true, alreadyPaid: true });
    expect(emails).toHaveLength(0);
  });

  it("never fails the order when the owner email throws", async () => {
    const admin = makeFakeAdmin({ updatedRows: [STORE_ORDER_ROW], items: [ITEM_ROW] });
    const res = await finalizePaidOrder(
      { orderId: "o1", paidAtISO: "t", provider: "icredit", saleId: "s", reference: null,
        receiptDocumentUrl: null, receiptDocumentNumber: null },
      { admin, sendOwnerEmail: async () => { throw new Error("smtp down"); }, ownerOrderUrlFor: () => "x" },
    );
    expect(res).toEqual({ ok: true, alreadyPaid: false });
  });
});
```
(`STORE_ORDER_ROW` must include `order_kind:"store"`, contact fields, `price_total`, `price_currency`, `delivery_method`, and ship_* fields needed by `buildOwnerStoreEmail`; `ITEM_ROW` mirrors an `order_items` row: `title_he/title_en/options/quantity/unit_price/line_total`.)

- [ ] **Step 2: Run it, verify it fails**

Run: `npm test -- lib/orders/finalize-paid-order.test.ts`
Expected: FAIL (module not found).

- [ ] **Step 3: Implement** (reference `buildOwnerStoreEmail` signature in `lib/emails/store-order-notification.ts`; reuse the locale="en" call shape already used in `confirm-store-order.ts` steps 9). Conditional update with `.neq("payment_status","paid").select()` for race-safe idempotency; map `order_items` rows to the email `lines` shape; gate email on `order.order_kind === "store"`.

```ts
import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { buildOwnerStoreEmail } from "@/lib/emails/store-order-notification";

export type FinalizePaidOrderInput = {
  orderId: string; paidAtISO: string; provider: string;
  saleId: string | null; reference: string | null;
  receiptDocumentUrl: string | null; receiptDocumentNumber: string | null;
};
export type FinalizePaidOrderDeps = {
  admin: SupabaseClient;
  sendOwnerEmail: (e: { subject: string; text: string; replyTo: string }) => Promise<void>;
  ownerOrderUrlFor: (id: string) => string;
  now?: () => string;
};
export type FinalizePaidOrderResult =
  | { ok: true; alreadyPaid: boolean }
  | { ok: false; message: string };

export async function finalizePaidOrder(
  input: FinalizePaidOrderInput,
  deps: FinalizePaidOrderDeps,
): Promise<FinalizePaidOrderResult> {
  const nowIso = deps.now ?? (() => new Date().toISOString());

  const { data: rows, error } = await deps.admin
    .from("orders")
    .update({
      payment_status: "paid",
      payment_provider: input.provider,
      provider_sale_id: input.saleId,
      payment_reference: input.reference,
      receipt_document_url: input.receiptDocumentUrl,
      receipt_document_number: input.receiptDocumentNumber,
      paid_at: input.paidAtISO,
      confirmed_at: nowIso(),
    })
    .eq("id", input.orderId)
    .neq("payment_status", "paid")
    .select("*");

  if (error) return { ok: false, message: "db_error" };
  if (!rows || rows.length === 0) return { ok: true, alreadyPaid: true };

  const order = rows[0] as Record<string, unknown>;
  if (order.order_kind === "store") {
    try {
      const { data: items } = await deps.admin
        .from("order_items")
        .select("title_he, title_en, options, quantity, unit_price, line_total")
        .eq("order_id", input.orderId);
      const lines = (items ?? []).map((r: Record<string, unknown>) => ({
        productId: "", titleHe: r.title_he as string, titleEn: r.title_en as string,
        imageUrl: null, options: (r.options as { labelHe: string; labelEn: string; value: string; choiceHe: string; choiceEn: string; key: string; priceDelta: number }[]) ?? [],
        quantity: r.quantity as number, unitPrice: r.unit_price as number, lineTotal: r.line_total as number,
      }));
      const email = buildOwnerStoreEmail({
        orderId: input.orderId,
        ownerOrderUrl: deps.ownerOrderUrlFor(input.orderId),
        contactName: order.contact_name as string,
        contactEmail: order.contact_email as string,
        contactPhone: order.contact_phone as string,
        delivery: deliveryFromOrder(order),
        lines, total: order.price_total as number, currency: order.price_currency as string,
        locale: "en",
      });
      await deps.sendOwnerEmail(email);
    } catch (err) {
      console.error("[finalizePaidOrder] owner email failed:", err);
    }
  }
  return { ok: true, alreadyPaid: false };
}

// Reconstruct the CheckoutInput-shaped delivery the email builder wants from the order row.
function deliveryFromOrder(order: Record<string, unknown>) {
  return {
    method: order.delivery_method as "pickup" | "shipping",
    firstName: order.contact_first_name as string,
    lastName: order.contact_last_name as string,
    phone: order.contact_phone as string,
    email: order.contact_email as string,
    addressLine1: (order.ship_address_line1 as string | null) ?? undefined,
    addressLine2: (order.ship_address_line2 as string | null) ?? undefined,
    city: (order.ship_city as string | null) ?? undefined,
    postalCode: (order.ship_postal_code as string | null) ?? undefined,
    country: (order.ship_country as string | null) ?? undefined,
    notes: (order.ship_notes as string | null) ?? undefined,
  };
}
```
(If `buildOwnerStoreEmail`'s `lines`/`delivery` types differ, adapt the mapping to match its exact input — inspect `lib/emails/store-order-notification.ts`. Keep the email best-effort.)

- [ ] **Step 4: Run it, verify it passes**

Run: `npm test -- lib/orders/finalize-paid-order.test.ts`
Expected: PASS (3/3).

- [ ] **Step 5: Commit**

```bash
GIT_CONFIG_GLOBAL=/dev/null git add lib/orders/finalize-paid-order.ts lib/orders/finalize-paid-order.test.ts
GIT_CONFIG_GLOBAL=/dev/null git commit -m "feat(orders): idempotent finalizePaidOrder core

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 8: Store confirm flow → hosted checkout + redirect

**Files:**
- Modify: `lib/store/confirm-store-order.ts`
- Modify: `app/actions/store.ts`
- Create: `lib/store/checkout-payload.ts` (pure builders) + `lib/store/checkout-payload.test.ts`
- Test: `lib/store/confirm-store-order.test.ts` (new)

**Interfaces:**
- Consumes: `PaymentProvider.createCheckout`, `finalizePaidOrder`, `computeStoreTotals`, `parseCheckout`.
- Produces:
  - `checkout-payload.ts`: `toCheckoutItems(lines: PricedLine[], locale: "he"|"en"): CheckoutLineItem[]`, `toCheckoutCustomer(delivery: CheckoutInput): CheckoutCustomer`.
  - `ConfirmStoreOrderInput` gains `locale: "he" | "en"`.
  - `ConfirmStoreOrderResult` `ok` variant gains `redirectUrl?: string`.
  - `ConfirmStoreOrderDeps` gains: `finalizePaidOrder: (input, )=>Promise<{ ok:boolean; alreadyPaid?:boolean }>` (bound with admin/email already), `redirectUrlFor: (guestToken: string, locale: "he"|"en") => string`, `ipnUrl: string`. (Keeps `paymentProvider`, `sendOwnerEmail`, `ownerOrderUrlFor`, `userId`, `now`.)

**Behavior change (replace steps 5–8 of `confirm-store-order.ts`):**
- After inserting order + items, build `items`/`customer` via the new pure builders and `createCheckout({ orderId, amount: total, currency, locale, items, customer, redirectUrl: redirectUrlFor(guestToken, locale), ipnUrl })`.
  - `failed` → delete the order (rollback), return `{ ok:false, message:"payment_failed" }`.
  - `redirect` → set `payment_provider` + `payment_reference` (PublicSaleToken), leave `awaiting_payment`/`confirmed_at` null; return `{ ok:true, orderId, guestToken, redirectUrl: url }`.
  - `paid` (mock) → call `deps.finalizePaidOrder({ orderId, paidAtISO: now, provider:"mock", saleId: reference, reference, receiptDocumentUrl:null, receiptDocumentNumber:null })`; return `{ ok:true, orderId, guestToken }`.
- **Idempotency block (top of function):** when an existing order is found:
  - `payment_status === "paid"` → `{ ok:true, orderId, guestToken }`.
  - else → re-`createCheckout` from the stored order + `order_items` (load them; build via the same pure builders + `deliveryFromOrder`-style mapping) and return its `redirectUrl` (mock → finalize + return ok). This makes a retry resume payment instead of duplicating the order.

- [ ] **Step 1: Write `checkout-payload.test.ts` (failing)**

```ts
import { describe, it, expect } from "vitest";
import { toCheckoutItems, toCheckoutCustomer } from "@/lib/store/checkout-payload";

describe("toCheckoutItems", () => {
  it("uses the locale title as description and keeps agorot unit prices", () => {
    const items = toCheckoutItems(
      [{ productId: "p1", titleHe: "מדבקה", titleEn: "Sticker", imageUrl: null, options: [],
         quantity: 2, unitPrice: 1500, lineTotal: 3000 }],
      "he",
    );
    expect(items).toEqual([{ description: "מדבקה", catalogNumber: "p1", unitPrice: 1500, quantity: 2 }]);
    expect(toCheckoutItems([{ productId: "p1", titleHe: "מדבקה", titleEn: "Sticker", imageUrl: null,
      options: [], quantity: 2, unitPrice: 1500, lineTotal: 3000 }], "en")[0].description).toBe("Sticker");
  });
});

describe("toCheckoutCustomer", () => {
  it("maps delivery fields", () => {
    expect(toCheckoutCustomer({ method: "shipping", firstName: "A", lastName: "B", phone: "05",
      email: "a@b.c", addressLine1: "St 1", city: "TLV", postalCode: "61000" }))
      .toEqual({ firstName: "A", lastName: "B", email: "a@b.c", phone: "05",
        address: "St 1", city: "TLV", postalCode: "61000" });
  });
});
```

- [ ] **Step 2: Run, verify fail; implement `checkout-payload.ts`**

```ts
import type { CheckoutLineItem, CheckoutCustomer } from "@/lib/payments/provider";
import type { PricedLine } from "@/lib/store/types";
import type { CheckoutInput } from "@/lib/stickers/checkout-schema";

export function toCheckoutItems(lines: PricedLine[], locale: "he" | "en"): CheckoutLineItem[] {
  return lines.map((l) => ({
    description: locale === "he" ? l.titleHe : l.titleEn,
    catalogNumber: l.productId,
    unitPrice: l.unitPrice,
    quantity: l.quantity,
  }));
}
export function toCheckoutCustomer(d: CheckoutInput): CheckoutCustomer {
  return {
    firstName: d.firstName, lastName: d.lastName, email: d.email, phone: d.phone,
    address: d.addressLine1 ?? null, city: d.city ?? null, postalCode: d.postalCode ?? null,
  };
}
```
Run: `npm test -- lib/store/checkout-payload.test.ts` → PASS.

- [ ] **Step 3: Write `confirm-store-order.test.ts` (failing)** — cover the three branches + idempotent-paid + idempotent-reissue. Inject a fake `paymentProvider` returning each result, a fake `finalizePaidOrder` spy, a fake admin (insert returns an order row with `id`/`guest_token`; the idempotency `maybeSingle` returns null first, then an existing row in the reissue test). Assert: redirect branch returns `redirectUrl` and does NOT call finalize; paid branch calls finalize and returns no redirect; failed branch deletes the order and returns `payment_failed`.

```ts
vi.mock("server-only", () => ({}));
import { describe, it, expect, vi } from "vitest";
import { confirmStoreOrder } from "@/lib/store/confirm-store-order";
// makeFakeAdmin mirrors lib/orders/confirm-order.test.ts: products select, orders insert/select/delete,
// order_items insert, idempotency maybeSingle. Implementer builds it to the shape this core queries.

const DEPS_BASE = {
  redirectUrlFor: (gt: string, l: string) => `https://s/${l}/store/track/${gt}`,
  ipnUrl: "https://s/api/payments/icredit/ipn",
  sendOwnerEmail: async () => {}, ownerOrderUrlFor: (id: string) => `https://s/admin/${id}`,
  userId: null, now: () => "2026-06-28T00:00:00.000Z",
};
// ... INPUT with one product in cart, valid pickup delivery, clientRequestId ...

it("redirect: returns the payment URL and does not finalize", async () => {
  const finalize = vi.fn(async () => ({ ok: true, alreadyPaid: false }));
  const res = await confirmStoreOrder(INPUT, { ...DEPS_BASE, admin: makeFakeAdmin(),
    paymentProvider: { createCheckout: async () => ({ status: "redirect", url: "https://pay/x", reference: "pub" }) },
    finalizePaidOrder: finalize });
  expect(res).toMatchObject({ ok: true, redirectUrl: "https://pay/x" });
  expect(finalize).not.toHaveBeenCalled();
});
// + paid branch (finalize called, no redirectUrl) and failed branch (order deleted, payment_failed).
```

- [ ] **Step 4: Implement the `confirm-store-order.ts` changes** per the Behavior section. Keep steps 0–4 (idempotency lookup, validate, load products, price) intact; replace 5–8 with the createCheckout switch; add the idempotent-reissue path; add `locale` to the input type and `redirectUrl?` to the result type. Build `redirectUrlFor`/`ipnUrl` from deps (do NOT hardcode the origin in the core).

- [ ] **Step 5: Wire `app/actions/store.ts`** — accept `locale` on the action input, pass it through; inject the new deps:

```ts
import { finalizePaidOrder as finalizePaidOrderCore } from "@/lib/orders/finalize-paid-order";
// inside confirmStoreOrder action:
const admin = createAdminSupabaseClient();
return confirmStoreOrderCore({ ...input }, {
  admin,
  paymentProvider: getPaymentProvider(),
  finalizePaidOrder: (fpInput) => finalizePaidOrderCore(fpInput, {
    admin, sendOwnerEmail, ownerOrderUrlFor: (id) => `${siteConfig.url}/he/admin/orders/${id}`,
  }),
  redirectUrlFor: (gt, locale) => `${siteConfig.url}/${locale}/store/track/${gt}`,
  ipnUrl: `${siteConfig.url}/api/payments/icredit/ipn`,
  sendOwnerEmail,
  ownerOrderUrlFor: (id) => `${siteConfig.url}/he/admin/orders/${id}`,
  userId: user?.id ?? null,
});
```
(The action's `input` type gains `locale: Locale`.)

- [ ] **Step 6: Run the store suites + typecheck**

Run: `npm test -- lib/store/ lib/orders/finalize-paid-order.test.ts && npx tsc --noEmit`
Expected: PASS; typecheck clean.

- [ ] **Step 7: Commit**

```bash
GIT_CONFIG_GLOBAL=/dev/null git add lib/store/confirm-store-order.ts lib/store/checkout-payload.ts lib/store/checkout-payload.test.ts lib/store/confirm-store-order.test.ts app/actions/store.ts
GIT_CONFIG_GLOBAL=/dev/null git commit -m "feat(store): hosted-checkout redirect via iCredit, finalize on webhook

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 9: Client follows the redirect

**Files:**
- Create: `lib/store/checkout-navigation.ts` + `lib/store/checkout-navigation.test.ts`
- Modify: `components/store/store-checkout.tsx`

**Interfaces:**
- Produces: `nextNavigation(result: { ok: true; guestToken: string; redirectUrl?: string }, lang: string): { kind: "redirect"; url: string } | { kind: "track"; href: string }`.

- [ ] **Step 1: Failing test**

```ts
import { describe, it, expect } from "vitest";
import { nextNavigation } from "@/lib/store/checkout-navigation";

describe("nextNavigation", () => {
  it("redirects to the payment URL when present", () => {
    expect(nextNavigation({ ok: true, guestToken: "gt", redirectUrl: "https://pay/x" }, "he"))
      .toEqual({ kind: "redirect", url: "https://pay/x" });
  });
  it("falls back to the track page (mock/paid path)", () => {
    expect(nextNavigation({ ok: true, guestToken: "gt" }, "en"))
      .toEqual({ kind: "track", href: "/en/store/track/gt" });
  });
});
```

- [ ] **Step 2: Run fail; implement**

```ts
export function nextNavigation(
  result: { ok: true; guestToken: string; redirectUrl?: string },
  lang: string,
): { kind: "redirect"; url: string } | { kind: "track"; href: string } {
  if (result.redirectUrl) return { kind: "redirect", url: result.redirectUrl };
  return { kind: "track", href: `/${lang}/store/track/${result.guestToken}` };
}
```
Run: `npm test -- lib/store/checkout-navigation.test.ts` → PASS.

- [ ] **Step 3: Wire the component** — in `handleSubmit`'s success branch, replace the hardcoded `router.push(...)` with:
```ts
if (result.ok) {
  const nav = nextNavigation(result, lang);
  if (nav.kind === "redirect") {
    // Going to iCredit — clear the local cart (the order holds the snapshot) but
    // keep the request id so a back-button retry resumes the same pending order.
    clear();
    window.location.assign(nav.url);
    return;
  }
  clear();
  try { sessionStorage.removeItem(REQUEST_KEY); } catch { /* ignore */ }
  router.push(nav.href);
  return;
}
```
Also pass `locale: lang` into the `confirmStoreOrder({...})` call (the action now requires it).

- [ ] **Step 4: Typecheck + targeted tests**

Run: `npx tsc --noEmit && npm test -- lib/store/checkout-navigation.test.ts`
Expected: clean + PASS.

- [ ] **Step 5: Commit**

```bash
GIT_CONFIG_GLOBAL=/dev/null git add lib/store/checkout-navigation.ts lib/store/checkout-navigation.test.ts components/store/store-checkout.tsx
GIT_CONFIG_GLOBAL=/dev/null git commit -m "feat(store): follow iCredit redirect from checkout

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 10: IPN webhook — core + route

**Files:**
- Create: `lib/payments/icredit/handle-ipn.ts` + `lib/payments/icredit/handle-ipn.test.ts`
- Create: `app/api/payments/icredit/ipn/route.ts`

**Interfaces:**
- Produces:
  - `type IpnOrder = { id: string; price_total: number; payment_status: string }`
  - `type HandleIpnDeps = { config: IcreditConfig; loadOrder: (orderId: string) => Promise<IpnOrder | null>; verify: (saleId: string, totalShekels: number) => Promise<string>; finalize: (args: { orderId: string; saleId: string; reference: string | null; paidAtISO: string; receiptDocumentUrl: string | null; receiptDocumentNumber: string | null }) => Promise<{ ok: boolean }>; issueFallbackReceipt?: (order: IpnOrder) => Promise<{ documentUrl: string; documentNumber: string } | null>; now?: () => string }`
  - `function handleIcreditIpn(raw: Record<string,string> | URLSearchParams, deps: HandleIpnDeps): Promise<{ status: number; body: string }>`

**Branch logic:**
1. `parseIpn(raw)`. If `groupPrivateToken !== config.token` → `{400,"bad_token"}`.
2. If `orderId` or `saleId` or `transactionAmount` null → `{400,"malformed"}`.
3. `order = loadOrder(orderId)`; null → `{404,"order_not_found"}`.
4. If `order.payment_status === "paid"` → `{200,"already_paid"}` (idempotent).
5. `status = verify(saleId, transactionAmount)`; `!== "VERIFIED"` → `{400,"not_verified"}`.
6. `amountMatches(transactionAmount, order.price_total)` false → `{400,"amount_mismatch"}`.
7. receipt: `documentUrl = ipn.documentUrl`; if null and `issueFallbackReceipt` provided → call it; capture url/number.
8. `finalize({ orderId, saleId, reference: ipn.authNum ?? saleId, paidAtISO: now, receiptDocumentUrl, receiptDocumentNumber })`. If `!ok` → `{500,"finalize_failed"}`.
9. `{200,"ok"}`.

- [ ] **Step 1: Failing test** — table-drive the branches with fakes:

```ts
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
```

- [ ] **Step 2: Run fail; implement `handle-ipn.ts`** per the branch logic (import `parseIpn`, `amountMatches`).

- [ ] **Step 3: Implement the route** `app/api/payments/icredit/ipn/route.ts`:

```ts
import { NextRequest } from "next/server";
import { createAdminSupabaseClient } from "@/lib/supabase/admin";
import { getIcreditConfig } from "@/lib/payments/icredit/config";
import { verifySale } from "@/lib/payments/icredit/client";
import { handleIcreditIpn } from "@/lib/payments/icredit/handle-ipn";
import { finalizePaidOrder } from "@/lib/orders/finalize-paid-order";
import { issueInvoiceReceipt } from "@/lib/payments/rivhit/issue-receipt";
import { sendOwnerEmail } from "@/lib/emails/send";
import { siteConfig } from "@/lib/site-config";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  const form = await req.formData();
  const raw: Record<string, string> = {};
  for (const [k, v] of form.entries()) raw[k] = String(v);

  const config = getIcreditConfig();
  const admin = createAdminSupabaseClient();
  const fallbackOn = process.env.RIVHIT_RECEIPT_FALLBACK === "on";

  const result = await handleIcreditIpn(raw, {
    config,
    loadOrder: async (orderId) => {
      const { data } = await admin.from("orders")
        .select("id, price_total, payment_status").eq("id", orderId).maybeSingle();
      return data ?? null;
    },
    verify: (saleId, totalShekels) =>
      verifySale({ host: config.host!, token: config.token!, saleId, totalAmountShekels: totalShekels }),
    finalize: (a) => finalizePaidOrder(
      { orderId: a.orderId, paidAtISO: a.paidAtISO, provider: "icredit", saleId: a.saleId,
        reference: a.reference, receiptDocumentUrl: a.receiptDocumentUrl, receiptDocumentNumber: a.receiptDocumentNumber },
      { admin, sendOwnerEmail, ownerOrderUrlFor: (id) => `${siteConfig.url}/he/admin/orders/${id}` },
    ),
    issueFallbackReceipt: fallbackOn
      ? (order) => issueInvoiceReceipt({ orderId: order.id, admin })
      : undefined,
  });

  return new Response(result.body, { status: result.status });
}
```
(`issueInvoiceReceipt`'s real signature comes from Task 11; adapt the call to match.)

- [ ] **Step 4: Run + typecheck**

Run: `npm test -- lib/payments/icredit/handle-ipn.test.ts && npx tsc --noEmit`
Expected: PASS; clean.

- [ ] **Step 5: Commit**

```bash
GIT_CONFIG_GLOBAL=/dev/null git add lib/payments/icredit/handle-ipn.ts lib/payments/icredit/handle-ipn.test.ts app/api/payments/icredit/ipn/route.ts
GIT_CONFIG_GLOBAL=/dev/null git commit -m "feat(payments): iCredit IPN webhook with Verify + amount check

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 11: Rivhit REST receipt fallback (off by default)

**Files:**
- Create: `lib/payments/rivhit/client.ts`, `lib/payments/rivhit/issue-receipt.ts`
- Test: `lib/payments/rivhit/issue-receipt.test.ts`

**Interfaces:**
- Produces (`client.ts`): `type RivhitEnvelope = { error_code: number; client_message: string; debug_message: string; data: unknown }`; `rivhitPost(endpoint: string, body: Record<string, unknown>, fetcher?: Fetcher): Promise<RivhitEnvelope>` (base `https://api.rivhit.co.il/online/RivhitOnlineAPI.svc/`).
- Produces (`issue-receipt.ts`):
  - `buildDocumentNewBody(args: { apiToken: string; orderId: string; customer: { firstName: string; lastName: string }; lines: { description: string; unitPriceShekels: number; quantity: number }[]; totalShekels: number; paymentType: number; language: "he"|"en" }): Record<string, unknown>` (pure)
  - `issueInvoiceReceipt(args: { orderId: string; admin: SupabaseClient }): Promise<{ documentUrl: string; documentNumber: string } | null>` (loads order+items, posts Document.New, maps `data.document_link`/`data.document_number`).

- [ ] **Step 1: Failing test (pure body builder is the unit under test)**

```ts
import { describe, it, expect } from "vitest";
import { buildDocumentNewBody } from "@/lib/payments/rivhit/issue-receipt";

describe("buildDocumentNewBody", () => {
  it("builds a חשבונית מס קבלה (type 2) with idempotency + payments", () => {
    const body = buildDocumentNewBody({
      apiToken: "TKN", orderId: "o1", customer: { firstName: "Dana", lastName: "Cohen" },
      lines: [{ description: "Sticker", unitPriceShekels: 12.34, quantity: 2 }],
      totalShekels: 24.68, paymentType: 3, language: "he",
    });
    expect(body).toMatchObject({
      api_token: "TKN", document_type: 2, price_include_vat: true,
      request_reference: "o1", prevent_duplicates: true, language: "he",
      first_name: "Dana", last_name: "Cohen",
      items: [{ description: "Sticker", price_nis: 12.34, quantity: 2 }],
      payments: [{ payment_type: 3, amount_nis: 24.68 }],
    });
  });
});
```

- [ ] **Step 2: Run fail; implement** both files. `rivhitPost` POSTs JSON to the base+endpoint and returns the parsed envelope. `issueInvoiceReceipt` loads the order (`contact_first_name`/`last_name`, `price_total`) + `order_items` (title_he, unit_price, quantity), converts agorot→shekels via `agorotToShekels`, calls `buildDocumentNewBody`, posts `Document.New`, and on `error_code === 0` returns `{ documentUrl: data.document_link, documentNumber: String(data.document_number) }`, else `null` (logged). Read `RIVHIT_API_TOKEN` + `RIVHIT_RECEIPT_PAYMENT_TYPE` (default 3) from env inside `issueInvoiceReceipt`.

- [ ] **Step 3: Run, verify pass**

Run: `npm test -- lib/payments/rivhit/issue-receipt.test.ts`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
GIT_CONFIG_GLOBAL=/dev/null git add lib/payments/rivhit/
GIT_CONFIG_GLOBAL=/dev/null git commit -m "feat(payments): Rivhit REST receipt fallback (Document.New type 2)

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 12: Adapt the sticker confirm call site

**Files:**
- Modify: `lib/orders/confirm-order.ts:160-175` (the `paymentProvider.createCharge` block)
- Modify: `lib/orders/confirm-order.test.ts` (the fake provider it injects)

**Interfaces:**
- Consumes: `PaymentProvider.createCheckout`.

**Behavior:** Replace the `createCharge` call with `createCheckout`, passing a minimal but valid input (the mock ignores it). Handle the result: `paid` → existing paid path; `failed` → `{ ok:false, message:"payment_failed" }`; `redirect` → `{ ok:false, message:"payment_redirect_unsupported" }` (stickers stay on the mock; this branch is defensive and unreachable with the mock).

- [ ] **Step 1: Update the test's fake provider** to expose `createCheckout` returning `{ status:"paid", reference:"MOCK-..." }` (was `createCharge`). Run it → FAILS against current `confirm-order.ts`.

- [ ] **Step 2: Update `confirm-order.ts`**

```ts
// 5. Payment (mock hosted-checkout → paid; stickers don't redirect today)
const payResult = await deps.paymentProvider.createCheckout({
  orderId: input.orderId,
  amount: order.price_total as number,
  currency: order.price_currency as string,
  locale: "he",
  items: [{ description: "Stickers order", catalogNumber: input.orderId,
            unitPrice: order.price_total as number, quantity: 1 }],
  customer: { firstName: delivery.firstName, lastName: delivery.lastName,
              email: delivery.email, phone: delivery.phone },
  redirectUrl: "", ipnUrl: "",
});
if (payResult.status === "failed") return { ok: false, message: "payment_failed" };
if (payResult.status === "redirect") return { ok: false, message: "payment_redirect_unsupported" };
const paid = payResult.status === "paid";
const paymentReference = payResult.reference ?? null;
```
(Keep the rest of the function — the `paid`/`paymentStatus`/`paidAtIso` derivation, re-key, markOrderPaid, owner email — unchanged.)

- [ ] **Step 3: Run the sticker suite + full suite + typecheck**

Run: `npm test && npx tsc --noEmit`
Expected: ALL tests PASS; typecheck clean.

- [ ] **Step 4: Commit**

```bash
GIT_CONFIG_GLOBAL=/dev/null git add lib/orders/confirm-order.ts lib/orders/confirm-order.test.ts
GIT_CONFIG_GLOBAL=/dev/null git commit -m "refactor(orders): adapt sticker confirm to createCheckout seam

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 13: The `rivhit-icredit` skill + cross-link

**Files:**
- Create: `.claude/skills/rivhit-icredit/SKILL.md`
- Create: `.claude/skills/rivhit-icredit/references/icredit-fields.md`, `.claude/skills/rivhit-icredit/references/rivhit-fields.md`
- Modify: `.claude/skills/sticker-shop/SKILL.md` (Payments row → point at the new skill)

**Content (SKILL.md):** frontmatter `name: rivhit-icredit` + a `description` covering: working on iCredit/Rivhit payments in this repo, the hosted-page redirect + IPN webhook flow, the `createCheckout` seam, server-side pricing/amount-verify invariants, receipt issuance, env/test creds. Body sections:
- Overview + "sub-area of `linecut-website`, sibling to `sticker-shop`"; when-to-use.
- **Flow** (the lifecycle: confirm → GetUrl → redirect → IPN → Verify → amount check → finalize → receipt).
- **Provider seam** (`createCheckout`, mock vs iCredit, `getPaymentProvider` env switch) + **`finalizePaidOrder`** (the one finalize path).
- **Security invariants** (server-priced, server-to-server, Verify=truth, amount match, `provider_sale_id` dedupe, agorot↔shekels at the edge only).
- **Receipt:** primary = iCredit `DocumentURL` from the IPN; fallback = `RIVHIT_RECEIPT_FALLBACK` → `Document.New` type 2.
- **File map** (the table from this plan).
- **Env + test creds** (table from Global Constraints) + **local-dev caveat** (IPN can't reach localhost; use a preview deploy/tunnel).
- **Confirmed API contracts** (GetUrl/Verify request+response, with `Status:0`/`VERIFIED`).
- **Common mistakes** (sending agorot to iCredit; trusting the IPN without Verify; marking paid before amount check; forgetting the partial unique index; clearing cart before order insert).
- **Maintenance** note (update when the seam/flow/env change).
- `references/*.md` hold the full GetUrl / IPN / Document.New field tables (condensed from `docs/superpowers/specs/2026-06-28-rivhit-icredit-design.md`).

**Cross-link:** in `sticker-shop/SKILL.md`, change the Payments file-map row (line ~52) and the "Roadmap seams" payment sentence (line ~111) to reference `rivhit-icredit` as the now-built provider for the store cart.

- [ ] **Step 1: Write `SKILL.md` + the two `references/*.md`** with the sections above. Pull exact field tables from the spec doc and the "Confirmed external API contracts" block of this plan.

- [ ] **Step 2: Update `sticker-shop/SKILL.md`** Payments row + roadmap sentence to point at `rivhit-icredit`.

- [ ] **Step 3: Validate the skill frontmatter + verify no stale claims**

Run: `head -5 .claude/skills/rivhit-icredit/SKILL.md` (confirm `name:`/`description:` frontmatter present and well-formed).

- [ ] **Step 4: Commit**

```bash
GIT_CONFIG_GLOBAL=/dev/null git add .claude/skills/rivhit-icredit/ .claude/skills/sticker-shop/SKILL.md
GIT_CONFIG_GLOBAL=/dev/null git commit -m "docs(skill): add rivhit-icredit skill + cross-link from sticker-shop

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Final verification (after all tasks)

- [ ] `npm test` — full suite green.
- [ ] `npx tsc --noEmit` — clean.
- [ ] `npm run lint` — clean.
- [ ] Manual (separate, on a preview deploy with `ICREDIT_MODE=test` + sandbox token): place a store order → land on the iCredit page → pay with `4580000000000000`/`111`/`123456790` → confirm the IPN flips the order to `paid` and `receipt_document_url` is populated. (Documents whether the test account auto-issues a document; if not, set `RIVHIT_RECEIPT_FALLBACK=on` + `RIVHIT_API_TOKEN`.)

## Self-review notes (author)

- **Spec coverage:** server-priced+server-to-server+amount-verify (Tasks 5/8/10), redirect UX (Tasks 8/9), webhook+Verify+idempotency (Task 10), receipt auto+fallback (Tasks 10/11), provider seam evolution (Tasks 4/6), schema (Task 1), skill (Task 13). All spec sections map to a task.
- **Type consistency:** `createCheckout`/`CreateCheckoutInput`/`CreateCheckoutResult` defined in Task 4 and consumed verbatim in 5/8/12; `finalizePaidOrder` shape defined in Task 7, consumed in 8/10; `parseIpn`/`IcreditIpn` in Task 3, consumed in 10.
- **Open items** from the spec are resolved: GetUrl response (`Status`/`URL`/`PublicSaleToken`) and Verify (`VERIFIED`) contracts are now confirmed and baked into Tasks 5/10.
