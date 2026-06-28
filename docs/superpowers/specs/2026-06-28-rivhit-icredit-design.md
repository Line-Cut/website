# Rivhit / iCredit payment integration — design spec

**Date:** 2026-06-28
**Status:** Approved (brainstorm), ready for plan + implementation
**Area:** Line Cut website — payments. Sub-area of `linecut-website`, sibling to `sticker-shop`.

## Goal

Charge a buyer the **server-computed cart total** through the **iCredit hosted
payment page** (redirect model), and on success record the **receipt**
(חשבונית מס קבלה) that iCredit/Rivhit issues. Deliver this as a real, working
integration wired to iCredit's **test sandbox** (flip to production by swapping
env tokens), plus a durable **`rivhit-icredit` skill** documenting it.

### Non-negotiable invariant (the user's core requirement)

The items and the amount **must not be modifiable from the UI**. This is
guaranteed structurally, not by trust:

1. The cart is **re-priced server-side** (`computeStoreTotals`) at confirm — the
   client-sent prices are display-only and ignored.
2. The iCredit `GetUrl` request is made **server-to-server** from our backend.
   The browser never sees or carries the line prices; it only receives the
   resulting hosted-page URL.
3. The IPN `TransactionAmount` is **re-verified** to equal the order total
   (after the `Verify` call) before the order is marked paid. A mismatch fails
   the webhook (non-2xx) and does **not** mark the order paid.

## The two APIs (reference)

### iCredit Payment Pages — the charge page

- **Tech:** REST + JSON, POST. Auth = `GroupPrivateToken` (GUID) in the body.
- **Endpoints** (host depends on mode):
  - Test: `https://testicredit.rivhit.co.il/API/PaymentPageRequest.svc/GetUrl`
  - Prod: `https://icredit.rivhit.co.il/API/PaymentPageRequest.svc/GetUrl`
  - Verify: same base, `/Verify` (test/prod hosts).
- **GetUrl request** (key fields; full set in skill `references/`):
  `GroupPrivateToken`, `Items:[{Id:0, CatalogNumber, UnitPrice, Quantity, Description}]`,
  `RedirectURL`, `IPNURL`, `ExemptVAT` (bool), `MaxPayments`, `EmailAddress`,
  `CustomerFirstName`, `CustomerLastName`, `Address`, `City`, `Zipcode`,
  `PhoneNumber`, `HideItemList` (bool), `DocumentLanguage` (`"he"`/`"en"`),
  `CreateToken` (bool), `Discount`, `Custom1..9` (**Custom1 = our orderId**),
  `Order`, `Reference`.
  - **Amount semantics:** `UnitPrice` is per-unit; total = Σ(UnitPrice×Quantity) − Discount.
    The doc's units are **shekels (decimal)**, not agorot — convert at the edge.
  - **`HideItemList=false`** so the buyer sees the itemised list on the page
    (they still cannot edit it).
- **GetUrl response:** returns the payment-page URL. **Exact field name/shape is
  NOT in the PDF** → must be captured by probing the sandbox (see Open items).
- **IPN** (iCredit → our `IPNURL`, HTTP **POST form-encoded**): includes `SaleId`,
  `GroupPrivateToken`, `TransactionAmount`, `Custom1` (our orderId), per-item
  fields, customer fields, and — when the account is configured to issue a
  document — `DocumentURL`, `DocumentNum`, `DocumentType`. Plus many
  `Transaction*` fields (`TransactionAuthNum`, `TransactionToken`, etc.).
- **Verify** (our webhook → iCredit, POST JSON): `{GroupPrivateToken, SaleId,
  TotalAmount}` → `{Status}`. `Status == "VERIFIED"` means the sale really
  charged. The doc's own listener stresses three follow-up checks:
  (a) the token belongs to us, (b) the sale was not already processed,
  (c) the amounts are correct.
- **Window types:** redirect / iframe / popup. **We use redirect** (no
  transition-page trick needed).

### Rivhit Online REST — receipts/invoices (fallback path only)

- **Base:** `https://api.rivhit.co.il/online/RivhitOnlineAPI.svc/`. Auth =
  `api_token` (GUID) in body. POST, HTTPS only.
- **Envelope:** `{ error_code, client_message, debug_message, data }`.
  `error_code == 0` = success.
- **`Document.New`** issues sale docs. `document_type` **2 = חשבונית מס קבלה**
  (invoice-receipt). Takes `items:[{description, price_nis|bruto_price_nis,
  quantity, ...}]` and `payments:[{payment_type, amount_nis, ...}]`. Customer via
  `customer_id` or overload fields (`first_name`/`last_name`/`address`/...). VAT
  via `price_include_vat`. Response `data`: `document_type`, `document_number`,
  `document_link` (PDF URL), `document_identity` (GUID), `print_status`,
  `customer_id`.
- **Idempotency:** `request_reference` + `prevent_duplicates=true` → re-sending
  the same `request_reference` errors instead of issuing a duplicate. Use the
  orderId as `request_reference`.
- `Receipt.New` (קבלה) and `Document.TypeList`/`Receipt.TypeList` also exist; we
  only need `Document.New` (type 2) for the fallback.

## Architecture

### Provider seam — evolve `PaymentProvider`

The current synchronous `createCharge → {paid|failed|awaiting}` cannot model a
hosted page. Replace it with a hosted-checkout contract that both the mock and
the real provider satisfy:

```ts
// lib/payments/provider.ts
export type CheckoutLineItem = {
  description: string;
  catalogNumber: string | null;
  unitPrice: number; // agorot
  quantity: number;
};
export type CheckoutCustomer = {
  firstName: string; lastName: string; email: string; phone: string;
  address?: string | null; city?: string | null; postalCode?: string | null;
};
export type CreateCheckoutInput = {
  orderId: string;
  amount: number;            // agorot, server-authoritative
  currency: string;          // "ILS"
  locale: "he" | "en";
  items: CheckoutLineItem[]; // server-priced
  customer: CheckoutCustomer;
  redirectUrl: string;       // thank-you / track page (absolute)
  ipnUrl: string;            // our webhook (absolute)
};
export type CreateCheckoutResult =
  | { status: "redirect"; url: string; reference: string } // hosted page
  | { status: "paid"; reference: string }                  // mock: finalize inline
  | { status: "failed"; reason: string };
export interface PaymentProvider {
  createCheckout(input: CreateCheckoutInput): Promise<CreateCheckoutResult>;
}
```

- **mock provider** returns `{status:"paid"}` → existing inline-finalize behavior
  (keeps the **sticker flow** working unchanged; no redirect).
- **iCredit provider** returns `{status:"redirect", url}`.
- `lib/payments/index.ts` `getPaymentProvider()` picks by env: `ICREDIT_MODE`
  unset/`"mock"` → mock; `"test"`/`"prod"` → iCredit.

### One finalization path — `finalizePaidOrder`

A single DI core `lib/orders/finalize-paid-order.ts` is the **only** place an
order transitions to paid. Called by **both** the mock's inline `paid` branch
**and** the IPN webhook. Responsibilities (idempotent):

1. Load order; if already `paid` (or `provider_sale_id` already set) → no-op success.
2. Set `payment_status="paid"`, `payment_provider`, `provider_sale_id`,
   `payment_reference`, `paid_at`, `receipt_document_url`,
   `receipt_document_number`, and `confirmed_at` (if null).
3. Run the existing post-payment pipeline `markOrderPaid` (stickers: copy to paid
   bucket + receipt; store: receipt seam) — best-effort.
4. Owner email — best-effort.

It does **not** call `Verify` or check amounts — the webhook does that before
calling it (the mock path has no amount to verify).

### Store checkout flow change

`lib/store/confirm-store-order.ts`:
- Steps 1–6 (validate, server-price, insert order pending + items) unchanged.
- Replace the `createCharge` block with `createCheckout(...)`:
  - `redirect` → return `{ ok:true, redirectUrl }` (order stays pending). Do NOT
    set `confirmed_at` here.
  - `paid` (mock) → call `finalizePaidOrder` inline, return `{ ok:true, orderId,
    guestToken }` (current behavior).
  - `failed` → roll back the order, return `{ ok:false, message:"payment_failed" }`.
- `components/store/store-checkout.tsx` + the store action: when a `redirectUrl`
  comes back, navigate the browser to it.

### IPN webhook

`app/api/payments/icredit/ipn/route.ts` (App Router route handler, locale-independent):
1. Parse the form-encoded POST (pure parser in `lib/payments/icredit/ipn.ts`).
2. Confirm `GroupPrivateToken` matches ours; look up order by `Custom1`.
3. Call `Verify`; require `Status == "VERIFIED"`.
4. Require `TransactionAmount` (shekels) == order total (agorot) after conversion.
5. Idempotency: if `provider_sale_id` already set → 200 no-op.
6. If the IPN carried `DocumentURL` → use it. Else, **iff** `RIVHIT_RECEIPT_FALLBACK`
   is on, call `Document.New` (type 2) to issue one; otherwise leave receipt empty
   (logged).
7. Call `finalizePaidOrder` with sale id, reference, amounts, receipt fields.
8. Return **200** on success and on already-processed; return **non-2xx** only on
   genuine verify/amount/lookup failure (so iCredit retries / flags correctly).

Security: the endpoint never trusts the POST body for payment truth — `Verify`
is the source of truth, amount is re-checked, and `provider_sale_id` dedupes.

## Files

| Area | Path | Kind |
|---|---|---|
| Provider contract | `lib/payments/provider.ts` | evolve types |
| Provider switch | `lib/payments/index.ts` | env-based pick |
| Mock provider | `lib/payments/manual-provider.ts` | conform to new contract (returns `paid`) |
| iCredit config | `lib/payments/icredit/config.ts` | env → `{mode, host, token}` (pure-ish) |
| iCredit client | `lib/payments/icredit/client.ts` | GetUrl + Verify (fetch) |
| iCredit IPN | `lib/payments/icredit/ipn.ts` | **pure** parse + amount/verify helpers |
| iCredit types | `lib/payments/icredit/types.ts` | request/response/IPN shapes |
| iCredit provider | `lib/payments/icredit/provider.ts` | implements `PaymentProvider` |
| Rivhit REST client | `lib/payments/rivhit/client.ts` | envelope POST helper |
| Rivhit receipt | `lib/payments/rivhit/issue-receipt.ts` | Document.New type 2 (fallback) |
| Finalize core | `lib/orders/finalize-paid-order.ts` | **DI core**, idempotent |
| Webhook | `app/api/payments/icredit/ipn/route.ts` | route handler |
| Store wiring | `lib/store/confirm-store-order.ts`, `components/store/store-checkout.tsx`, `app/actions/store.ts` | follow redirect |
| Schema | `supabase/migrations/<ts>_payment_provider_fields.sql` | new columns |
| Skill | `.claude/skills/rivhit-icredit/SKILL.md` + `references/` | docs |
| Skill cross-link | `.claude/skills/sticker-shop/SKILL.md` | point Payments row at new skill |

## Schema (migration)

Add to `orders` (all nullable; additive, no behavior change to existing rows):

- `payment_provider text` — e.g. `"icredit"` / `"mock"`.
- `provider_sale_id text` — iCredit `SaleId`; **partial UNIQUE index** where not
  null (idempotency / dedupe).
- `receipt_document_url text` — iCredit `DocumentURL` (or Rivhit `document_link`).
- `receipt_document_number text` — `DocumentNum` / `document_number`.

Existing columns reused: `payment_status`, `payment_reference`, `paid_at`,
`confirmed_at`, `receipt_storage_key`, `payment_meta`.

## Config / env

| Var | Meaning |
|---|---|
| `ICREDIT_MODE` | `mock` (default/unset) \| `test` \| `prod` — selects provider + host |
| `ICREDIT_GROUP_PRIVATE_TOKEN` | iCredit GroupPrivateToken (per mode) |
| `RIVHIT_API_TOKEN` | Rivhit Online api_token (only if fallback on) |
| `RIVHIT_RECEIPT_FALLBACK` | `"on"` to issue via REST when IPN has no document; default off |
| `NEXT_PUBLIC_SITE_URL` | existing — base for absolute RedirectURL/IPNURL |

**Sandbox test values (from the Rivhit knowledge base, test only):**
GroupPrivateToken `80d75f51-1ca1-41a8-a698-8183d68499c6`; test card
`4580000000000000`, CVV `111`, ID `123456790`.

**Local-dev caveat:** iCredit cannot reach `localhost` for the IPN — webhook
testing requires a public URL (preview deploy or a tunnel). Document this.

## Testing

- **Unit (pure, required):** `ipn.ts` (parse + amount-match + token-match),
  `config.ts` (mode/host/token resolution), `finalize-paid-order.ts`
  (idempotency: second call no-ops; sets fields), `manual-provider` (still
  returns `paid`), and the store-confirm redirect/paid/failed branching.
- **Manual (post-merge, on a preview deploy):** probe `GetUrl` with the sandbox
  token to confirm response/IPN shapes, then a full test-card charge → confirm
  the order flips to paid and a receipt URL is recorded.

## Open items — resolve during implementation (do NOT block the plan)

1. **Exact `GetUrl` response field** holding the URL, and **IPN param casing** —
   capture by probing the test sandbox as the first implementation task; encode
   the confirmed shapes in `types.ts`/`ipn.ts`.
2. **Does the test account auto-issue a document?** If yes, the REST fallback
   stays off (resolves "is option 1 enough?"). If no, turn `RIVHIT_RECEIPT_FALLBACK`
   on and supply `RIVHIT_API_TOKEN`.

## Out of scope

- Sticker flow keeps the mock (redirect adoption for stickers is a later, trivial
  swap once the seam is proven on the store cart).
- Refunds/voids, partial payments, saved-card tokens (`CreateToken`), multi-currency.
- A bespoke styled receipt PDF (we surface iCredit's `DocumentURL`).
