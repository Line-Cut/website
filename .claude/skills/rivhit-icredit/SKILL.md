---
name: rivhit-icredit
description: Use when working on iCredit/Rivhit payments in this repo — the hosted-page redirect + IPN webhook flow, the createCheckout provider seam, server-side pricing and amount-verify invariants, receipt issuance (primary from iCredit DocumentURL; fallback via Rivhit Document.New), env configuration, test sandbox credentials, or the finalizePaidOrder idempotent finalize path. This is the payment integration for the store cart (not the sticker flow, which still uses the mock provider).
---

# Rivhit / iCredit Payment Integration

## Overview

This integration charges the server-computed store-cart total through the **iCredit hosted payment page** (redirect model). On success, iCredit posts an IPN webhook to our backend; we verify the sale, re-check the amount, and flip the order to paid. The receipt (חשבונית מס קבלה) is captured from the IPN when iCredit auto-issues one; a Rivhit REST fallback can issue it explicitly.

**This skill is a sub-area of `linecut-website`, sibling to `sticker-shop`.** For i18n/RTL/dictionary, use `rtl-bilingual-nextjs`; for brand/component conventions, use `linecut-website`; for the sticker order flow and `PaymentProvider` history, use `sticker-shop`. This guide covers only the iCredit/Rivhit integration.

## When to Use

- Editing the iCredit hosted-page request (GetUrl), the Verify call, or the IPN webhook handler.
- Changing the `PaymentProvider.createCheckout` seam or the `getPaymentProvider` env switch.
- Working on `finalizePaidOrder` (the one idempotent finalize path for store orders).
- Adding or modifying Rivhit receipt logic (`Document.New` type 2 fallback).
- Configuring env vars or test sandbox credentials.
- Wiring a new provider (replace `createIcreditProvider`; conform to `PaymentProvider`).
- Debugging webhook failures, amount mismatches, or duplicate-payment guards.

---

## Flow

```
Store checkout form
  → confirmStoreOrder (server action)
      → computeStoreTotals (server-priced)
      → PaymentProvider.createCheckout (server-to-server GetUrl)
          → {status:"redirect", url}
              → return {ok:true, redirectUrl} to browser
              → browser: window.location.assign(url)
              → buyer fills iCredit hosted page + pays

iCredit → POST /api/payments/icredit/ipn (form-encoded)
  → handleIcreditIpn (DI core) — guard order:
      1. parseIpn (case-insensitive)
      2. confirm GroupPrivateToken === config.token   (else 400 bad_token; also rejects a null/empty config token)
      3. require saleId + orderId + transactionAmount   (else 400 malformed — BEFORE Verify)
      4. loadOrder by Custom1 (our orderId)            (else 404 order_not_found)
      5. idempotency: if already paid → 200 already_paid
      6. verifySale → POST Verify → Status === "VERIFIED"   (else 400 not_verified)
      7. amountMatches: TransactionAmount (shekels) === order.price_total (agorot)   (else 400 amount_mismatch)
      8. resolve receipt: IPN DocumentURL (primary) OR issueFallbackReceipt (if RIVHIT_RECEIPT_FALLBACK=on)
      9. finalizePaidOrder (idempotent DB update + owner email)
      10. return 200

Mock path (ICREDIT_MODE unset or "mock"):
  createCheckout → {status:"paid"} → finalizePaidOrder called inline → return {ok:true}
```

The **sticker flow** calls `createCheckout` in `lib/orders/confirm-order.ts` but only ever receives the mock `paid` result — the sticker path does not redirect and is not changed by this integration.

---

## Provider Seam

### `PaymentProvider.createCheckout`

Defined in `lib/payments/provider.ts`. Takes `CreateCheckoutInput` (orderId, amount in agorot, currency, locale, server-priced items, customer, absolute redirectUrl, absolute ipnUrl). Returns a union:

| `status` | Meaning | Action |
|---|---|---|
| `"redirect"` | iCredit hosted page ready | Return `redirectUrl` to browser; browser calls `window.location.assign` |
| `"paid"` | Mock: no redirect, charge simulated | Call `finalizePaidOrder` inline |
| `"failed"` | GetUrl rejected or provider not configured | Delete the pending order; return `{ok:false, message:"payment_failed"}` |

### `getPaymentProvider()` — env switch

`lib/payments/index.ts`. `ICREDIT_MODE` unset or `"mock"` → `manualPaymentProvider` (returns `{status:"paid"}`). `"test"` or `"prod"` → `createIcreditProvider({config})`.

### `finalizePaidOrder` — the ONE finalize path

`lib/orders/finalize-paid-order.ts`. Called by:
1. The mock inline `paid` branch inside `confirmStoreOrder`.
2. The IPN webhook after Verify + amount check.

Responsibilities (idempotent):
- UPDATE `orders` SET `payment_status="paid"`, `payment_provider`, `provider_sale_id`, `payment_reference`, `receipt_document_url`, `receipt_document_number`, `paid_at`, and `confirmed_at = now` (set **unconditionally** — store orders are inserted with `confirmed_at = null` and only finalized once, so this is effectively a first-write) WHERE `id = orderId AND payment_status <> 'paid'`.
- The `.neq("payment_status","paid")` guard — **not** a COALESCE — is what makes this idempotent: a second call matches 0 rows.
- If 0 rows updated → already paid → `{ok:true, alreadyPaid:true}` (no email).
- On a real transition (store orders only): fetch `order_items`, send owner email best-effort (never fails the order).

Does **not** call Verify or check amounts — the webhook does that before calling it.

---

## Security Invariants — do not break these

1. **Cart re-priced server-side.** `computeStoreTotals` (`lib/store/pricing.ts`), called from `lib/store/confirm-store-order.ts`, re-prices the cart on the server; client-sent prices are ignored.
2. **GetUrl is server-to-server.** The browser never sees prices; it only receives the resulting hosted-page URL.
3. **IPN `TransactionAmount` is re-verified.** After `Verify` succeeds, `amountMatches(transactionAmountShekels, order.price_total)` must be true. A mismatch returns non-2xx — the order is **not** marked paid.
4. **`Verify` is the source of truth.** The IPN body is not trusted for payment truth. `Status === "VERIFIED"` is required.
5. **`provider_sale_id` partial-unique dedupes replays.** The partial unique index (`orders_provider_sale_id_key` WHERE `provider_sale_id IS NOT NULL`) ensures a given iCredit `SaleId` can only finalize one order. The webhook also checks `payment_status === "paid"` for an in-memory idempotency fast-path.
6. **Money is agorot internally, shekels only at the iCredit/Rivhit edge.** Use `agorotToShekels` when building GetUrl/Verify/Rivhit requests; use `shekelsToAgorot` (= `Math.round(s*100)`) when reading the IPN `TransactionAmount`. Never store or compare shekel floats.

---

## Receipt

**Primary path:** when iCredit's account is configured to auto-issue, the IPN carries `DocumentURL` and `DocumentNum`. `handleIcreditIpn` stores them on the order via `finalizePaidOrder` → `receipt_document_url` and `receipt_document_number`.

**Fallback path:** if the IPN has no `DocumentURL` and `RIVHIT_RECEIPT_FALLBACK=on`, `issueInvoiceReceipt` calls `POST https://api.rivhit.co.il/online/RivhitOnlineAPI.svc/Document.New` (`document_type: 2` = חשבונית מס קבלה) and stores the returned `document_link`/`document_number`. Uses `RIVHIT_API_TOKEN`. Idempotent via `request_reference=orderId` + `prevent_duplicates:true`.

If both fail (no IPN doc, fallback off or also fails), `receipt_document_url` is left null (logged).

---

## File Map

| File | Responsibility |
|---|---|
| `lib/payments/provider.ts` | `CheckoutLineItem`, `CheckoutCustomer`, `CreateCheckoutInput`, `CreateCheckoutResult`, `PaymentProvider` interface |
| `lib/payments/manual-provider.ts` | Mock provider → `createCheckout` returns `{status:"paid", reference:"MOCK-<orderId>"}` |
| `lib/payments/index.ts` | `getPaymentProvider()` — picks mock vs iCredit by `ICREDIT_MODE` |
| `lib/payments/icredit/config.ts` | `getIcreditConfig(env?)` → `{mode, host, token}` (pure) |
| `lib/payments/icredit/money.ts` | `agorotToShekels`, `shekelsToAgorot`, `amountMatches` (pure) |
| `lib/payments/icredit/ipn.ts` | `parseIpn(raw)` — case-insensitive form-encoded → `IcreditIpn` (pure) |
| `lib/payments/icredit/types.ts` | `IcreditIpn`, `GetUrlResponse`, `VerifyResponse` TS shapes |
| `lib/payments/icredit/client.ts` | `requestPaymentPage` (GetUrl), `verifySale` (Verify); DI `Fetcher` |
| `lib/payments/icredit/provider.ts` | `createIcreditProvider(deps)` implementing `PaymentProvider` |
| `lib/payments/icredit/handle-ipn.ts` | `handleIcreditIpn(raw, deps)` — all webhook branch logic (DI core) |
| `lib/payments/rivhit/client.ts` | `rivhitPost(endpoint, body, fetcher?)` — Rivhit envelope POST helper |
| `lib/payments/rivhit/issue-receipt.ts` | `buildDocumentNewBody`, `issueInvoiceReceipt` — Document.New type 2 fallback |
| `lib/orders/finalize-paid-order.ts` | `finalizePaidOrder(input, deps)` — the one idempotent store-order finalize |
| `lib/store/checkout-payload.ts` | `toCheckoutItems(lines, locale)`, `toCheckoutCustomer(delivery)` — pure builders |
| `lib/store/checkout-navigation.ts` | `nextNavigation(result, lang)` — pure: redirect vs track-page routing |
| `lib/store/confirm-store-order.ts` | Creates order + items, calls `createCheckout`, dispatches on result |
| `app/actions/store.ts` | Server action: wires admin, provider, `finalizePaidOrder`, URL builders |
| `components/store/store-checkout.tsx` | Client: calls `confirmStoreOrder`; on `redirectUrl` → `window.location.assign` |
| `app/api/payments/icredit/ipn/route.ts` | POST route handler → `handleIcreditIpn` (thin, `force-dynamic`) |
| `supabase/migrations/20260628000000_payment_provider_fields.sql` | Adds `payment_provider`, `provider_sale_id` (partial-unique), `receipt_document_url`, `receipt_document_number` to `orders` |

---

## Confirmed API Contracts

### GetUrl

`POST https://{host}/API/PaymentPageRequest.svc/GetUrl` — JSON, no auth header (token in body).

Key request fields (see `references/icredit-fields.md` for the full table):

| Field | Value |
|---|---|
| `GroupPrivateToken` | GUID from `ICREDIT_GROUP_PRIVATE_TOKEN` |
| `Items` | `[{Id:0, CatalogNumber, UnitPrice (shekels), Quantity, Description}]` |
| `RedirectURL` | Absolute thank-you / track URL |
| `IPNURL` | Absolute webhook URL |
| `Custom1` | Our `orderId` (echoed back in IPN) |
| `DocumentLanguage` | `"he"` or `"en"` |
| `ExemptVAT` | `false` |
| `HideItemList` | `false` (buyer sees itemised list; cannot edit) |
| `EmailAddress`, `CustomerFirstName`, `CustomerLastName`, `PhoneNumber`, `Address`, `City`, `Zipcode` | customer fields |

Confirmed response shape (probed 2026-06-28):
```json
{
  "Status": 0,
  "URL": "https://testicredit.rivhit.co.il/payment/PaymentItems.aspx?GroupId=...&Token=...",
  "PublicSaleToken": "<guid>",
  "PrivateSaleToken": "<guid>",
  "DebugMessage": null
}
```
`Status === 0` and `URL` present → success (redirect to `URL`). Non-zero or missing `URL` → failure (`DebugMessage` carries the reason).

### Verify

`POST https://{host}/API/PaymentPageRequest.svc/Verify` — JSON.

Request:
```json
{ "GroupPrivateToken": "<guid>", "SaleId": "<guid>", "TotalAmount": 123.45 }
```
(`TotalAmount` in **shekels**.)

Confirmed response: `{"Status":"VERIFIED"}` on a real paid sale; `{"Status":"NOTVERIFIED"}` otherwise. HTTP 200 either way.

### Hosts

| Mode | Host |
|---|---|
| `test` | `https://testicredit.rivhit.co.il` |
| `prod` | `https://icredit.rivhit.co.il` |

### IPN (iCredit → `IPNURL`)

HTTP POST, **form-encoded**. Key fields: `SaleId`, `GroupPrivateToken`, `TransactionAmount` (shekels), `Custom1` (our orderId), `TransactionAuthNum`, and (when auto-issued) `DocumentURL`, `DocumentNum`, `DocumentType`. Field casing from a live IPN is unverified — `parseIpn` looks up keys **case-insensitively**. The stored `payment_reference` is `ipn.authNum ?? ipn.saleId` — it falls back to `SaleId` when `TransactionAuthNum` is null.

### Rivhit Document.New (fallback)

`POST https://api.rivhit.co.il/online/RivhitOnlineAPI.svc/Document.New` (see `references/rivhit-fields.md`). Envelope: `{error_code, client_message, debug_message, data}`. `error_code === 0` = success; `data.document_link` and `data.document_number` are stored on the order.

---

## Env Vars

| Var | Default | Meaning |
|---|---|---|
| `ICREDIT_MODE` | `mock` (unset treated as mock) | `mock` \| `test` \| `prod` — selects provider + host |
| `ICREDIT_GROUP_PRIVATE_TOKEN` | — | iCredit GroupPrivateToken GUID |
| `RIVHIT_API_TOKEN` | — | Rivhit Online `api_token` (only needed when `RIVHIT_RECEIPT_FALLBACK=on`) |
| `RIVHIT_RECEIPT_FALLBACK` | off | Set `"on"` to issue receipt via Rivhit REST when the IPN has no `DocumentURL` |
| `RIVHIT_RECEIPT_PAYMENT_TYPE` | `3` | Rivhit `payment_type` integer for the payments array |
| `RIVHIT_LANGUAGE` | `"he"` | Language for Rivhit `Document.New` (`"he"` or `"en"`) |
| `NEXT_PUBLIC_SITE_URL` | — | Canonical origin — used to build absolute `RedirectURL` and `IPNURL` |

### Sandbox Test Credentials (test only, public in Rivhit knowledge base)

| Item | Value |
|---|---|
| `ICREDIT_GROUP_PRIVATE_TOKEN` | `80d75f51-1ca1-41a8-a698-8183d68499c6` |
| Test card number | `4580000000000000` |
| CVV | `111` |
| ID | `123456790` |

Set `ICREDIT_MODE=test` + the token above in `.env.local` (or a preview Vercel env) to use the sandbox.

### Local-dev caveat

iCredit cannot POST the IPN to `localhost`. Webhook testing requires a **public URL** — use a Vercel preview deploy or an ngrok/cloudflared tunnel. The hosted-page redirect itself works from localhost (you can visit the URL manually); only the webhook callback cannot reach a local server.

---

## Common Mistakes

- **Sending agorot to iCredit.** `UnitPrice` and `TotalAmount` must be in **shekels** (use `agorotToShekels`). Sending agorot charges 100× too much (or the gateway rejects it).
- **Trusting the IPN without `Verify`.** The IPN POST body can be forged. Always call `Verify` first; `Status === "VERIFIED"` is the source of truth.
- **Marking paid before the amount check.** `amountMatches` must pass before `finalizePaidOrder` is called. A mismatch must return non-2xx so iCredit retries / flags the webhook.
- **Clearing `REQUEST_KEY` (sessionStorage) before redirect.** `store-checkout.tsx` intentionally keeps `REQUEST_KEY` when navigating to iCredit, so that a back-button or retry resumes the same pending order rather than creating a duplicate. Only clear it after the mock `paid` path completes.
- **Forgetting the partial-unique `provider_sale_id` index.** Without `orders_provider_sale_id_key`, a replayed IPN could pay the same order twice (via a race). The DB index is the last-resort guard; the `payment_status <> 'paid'` filter in `finalizePaidOrder` is the first.
- **Hardcoding the origin in a core.** `redirectUrlFor` and `ipnUrl` are injected by the server action (`app/actions/store.ts`) from `siteConfig.url`. Cores must not import `siteConfig` or `NEXT_PUBLIC_SITE_URL` directly.
- **Calling `createCheckout` from a client component.** The GetUrl request must be server-to-server. The `confirmStoreOrder` action is the only call site.
- **Reusing `handleIcreditIpn` with a null config token.** `handle-ipn.ts` rejects the IPN when `config.token` is falsy (to prevent `null === null` matching). Never call the webhook handler with an unconfigured `ICREDIT_MODE=mock` config.

---

## Maintenance

This skill is part of the code. Update it (in the same PR) when:
- The `createCheckout` / `PaymentProvider` seam changes shape.
- The IPN, GetUrl, or Verify contracts are updated.
- New env vars are added or defaults change.
- The `finalizePaidOrder` behavior or the receipt strategy changes.
- The schema gains new payment-related columns.
- The sticker flow is wired to iCredit (currently mock-only).
