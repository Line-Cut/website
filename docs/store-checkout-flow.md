# Store Checkout Flow

The store cart uses a **create-at-confirm** model (no draft row — the cart lives client-side) with iCredit hosted-page redirect as the payment provider. The sticker shop uses a different, mock-only flow; this document covers **only the store cart**.

---

## Flow Diagram

```mermaid
sequenceDiagram
    participant Browser
    participant SA as Server Action<br/>(app/actions/store.ts)
    participant Core as confirmStoreOrder<br/>(lib/store/confirm-store-order.ts)
    participant DB as Supabase (admin client)
    participant IC as iCredit API<br/>(testicredit / icredit .rivhit.co.il)
    participant Webhook as POST /api/payments/icredit/ipn
    participant Rivhit as Rivhit API<br/>(api.rivhit.co.il) [fallback]

    Browser->>SA: confirmStoreOrder({items, delivery, clientRequestId, locale})
    SA->>SA: feature-access check ("store")<br/>→ 403 if forbidden
    SA->>Core: confirmStoreOrderCore(input, deps)

    Note over Core: 1. Idempotency — look up clientRequestId
    Core->>DB: SELECT order WHERE client_request_id = ?
    alt already paid
        DB-->>Core: order (payment_status=paid)
        Core-->>SA: {ok:true, orderId, guestToken}
        SA-->>Browser: {ok:true}
    else pending retry
        DB-->>Core: order (awaiting_payment)
        Core->>Core: reissueCheckout (re-run GetUrl with stored totals)
    else not found
        DB-->>Core: null → continue

        Note over Core: 2. Validate delivery + cart (Zod)
        Core->>Core: parseCheckout(delivery)
        Core->>Core: parseCartItems(items)

        Note over Core: 3. Load active products
        Core->>DB: SELECT products WHERE id IN (...) AND status='active'
        DB-->>Core: product rows
        Core->>Core: computeStoreTotals → {lines, total (agorot), currency}

        Note over Core: 4. Insert order row
        Core->>DB: INSERT orders {order_kind:store, payment_status:awaiting_payment,<br/>confirmed_at:null, price_total, ...customer, ...delivery}
        DB-->>Core: {id, guest_token}

        Note over Core: 5. Insert order_items (price snapshot)
        Core->>DB: INSERT order_items [{product_id, title_he/en, options,<br/>quantity, unit_price, line_total, sort_index}]
    end

    Note over Core: 6. PaymentProvider.createCheckout
    Core->>IC: POST /API/PaymentPageRequest.svc/GetUrl<br/>{GroupPrivateToken, Items (shekels), Custom1=orderId,<br/>RedirectURL, IPNURL, customer fields, DocumentLanguage}
    IC-->>Core: {Status:0, URL:"https://...icredit.../payment/..."}

    alt GetUrl failed
        IC-->>Core: Status != 0 or missing URL
        Core->>DB: DELETE orders WHERE id=orderId
        Core-->>SA: {ok:false, message:"payment_failed"}
        SA-->>Browser: {ok:false}
    else redirect
        Core->>DB: UPDATE orders SET payment_provider='icredit', payment_reference=PublicSaleToken
        Core-->>SA: {ok:true, orderId, guestToken, redirectUrl}
        SA-->>Browser: {ok:true, redirectUrl}
        Browser->>Browser: window.location.assign(redirectUrl)
        Browser->>IC: Customer fills card details on iCredit hosted page
        IC->>IC: Charge card
        IC-->>Browser: Redirect to RedirectURL (/{lang}/store/track/{guestToken})
    end

    Note over Webhook: Async — iCredit POSTs IPN regardless of browser state
    IC->>Webhook: POST /api/payments/icredit/ipn (form-encoded)<br/>{SaleId, GroupPrivateToken, TransactionAmount (shekels),<br/>Custom1=orderId, TransactionAuthNum, DocumentURL?, DocumentNum?}

    Webhook->>Webhook: 1. parseIpn (case-insensitive key lookup)
    Webhook->>Webhook: 2. GroupPrivateToken === config.token → else 400 bad_token
    Webhook->>Webhook: 3. require SaleId + orderId + TransactionAmount → else 400 malformed

    Webhook->>DB: 4. SELECT order WHERE id=Custom1
    DB-->>Webhook: order {price_total, payment_status}

    alt order not found
        Webhook-->>IC: 404 order_not_found
    else already paid (idempotency)
        Webhook-->>IC: 200 already_paid
    else
        Webhook->>IC: 5. POST /API/PaymentPageRequest.svc/Verify<br/>{GroupPrivateToken, SaleId, TotalAmount (shekels)}
        IC-->>Webhook: {Status:"VERIFIED"} or {Status:"NOTVERIFIED"}

        alt not verified
            Webhook-->>IC: 400 not_verified
        else
            Webhook->>Webhook: 6. amountMatches(TransactionAmount, order.price_total)
            alt mismatch
                Webhook-->>IC: 400 amount_mismatch
            else
                alt IPN has DocumentURL
                    Webhook->>Webhook: 7a. use IPN DocumentURL + DocumentNum
                else RIVHIT_RECEIPT_FALLBACK=on
                    Webhook->>Rivhit: 7b. POST /online/RivhitOnlineAPI.svc/Document.New<br/>{document_type:2, request_reference:orderId, prevent_duplicates:true}
                    Rivhit-->>Webhook: {error_code:0, data:{document_link, document_number}}
                end

                Webhook->>DB: 8. finalizePaidOrder<br/>UPDATE orders SET payment_status='paid', confirmed_at=now,<br/>payment_provider, provider_sale_id, payment_reference,<br/>receipt_document_url, receipt_document_number, paid_at<br/>WHERE id=orderId AND payment_status <> 'paid'
                Webhook->>Webhook: 9. send owner email (best-effort)
                Webhook-->>IC: 200 ok
            end
        end
    end

    Browser->>Browser: /store/track/{guestToken} — polling order status
```

---

## Key iCredit Endpoints

| Endpoint | Method | Auth | Purpose |
|---|---|---|---|
| `{host}/API/PaymentPageRequest.svc/GetUrl` | POST JSON | `GroupPrivateToken` in body | Request a hosted payment page; returns a one-time `URL` |
| `{host}/API/PaymentPageRequest.svc/Verify` | POST JSON | `GroupPrivateToken` in body | Confirm a sale by `SaleId`; returns `{Status:"VERIFIED"}` |
| `{NEXT_PUBLIC_SITE_URL}/api/payments/icredit/ipn` | POST form-encoded | `GroupPrivateToken` in body | iCredit IPN webhook (our endpoint, iCredit calls it) |

Hosts:

| `ICREDIT_MODE` | Host |
|---|---|
| `test` | `https://testicredit.rivhit.co.il` |
| `prod` | `https://icredit.rivhit.co.il` |

### GetUrl — key request fields

```jsonc
{
  "GroupPrivateToken": "<GUID>",         // ICREDIT_GROUP_PRIVATE_TOKEN
  "Items": [
    {
      "Id": 0,
      "CatalogNumber": "<productId>",
      "UnitPrice": 12.50,                // shekels (not agorot!)
      "Quantity": 2,
      "Description": "Product title"
    }
  ],
  "RedirectURL": "https://site/he/store/track/<guestToken>",
  "IPNURL": "https://site/api/payments/icredit/ipn",
  "Custom1": "<orderId>",                // echoed back in IPN
  "DocumentLanguage": "he",             // or "en"
  "ExemptVAT": false,
  "HideItemList": false,
  "EmailAddress": "customer@example.com",
  "CustomerFirstName": "...",
  "CustomerLastName": "...",
  "PhoneNumber": "...",
  "Address": "...",
  "City": "...",
  "Zipcode": "..."
}
```

### GetUrl — response

```jsonc
{
  "Status": 0,            // 0 = success; non-zero = failure
  "URL": "https://testicredit.rivhit.co.il/payment/PaymentItems.aspx?GroupId=...&Token=...",
  "PublicSaleToken": "<guid>",
  "PrivateSaleToken": "<guid>",
  "DebugMessage": null    // populated on failure
}
```

### Verify — request/response

```jsonc
// Request
{ "GroupPrivateToken": "<GUID>", "SaleId": "<guid>", "TotalAmount": 25.00 }  // shekels

// Response
{ "Status": "VERIFIED" }   // or "NOTVERIFIED"
```

### IPN — inbound form fields (iCredit → our server)

| Field | Type | Notes |
|---|---|---|
| `SaleId` | string | iCredit sale GUID |
| `GroupPrivateToken` | string | Must match `ICREDIT_GROUP_PRIVATE_TOKEN` |
| `TransactionAmount` | number (string) | In **shekels**; compared against `price_total` agorot |
| `Custom1` | string | Our `orderId` |
| `TransactionAuthNum` | string \| null | Auth number; used as `payment_reference` (falls back to `SaleId`) |
| `DocumentURL` | string \| null | Receipt URL if iCredit auto-issued one |
| `DocumentNum` | string \| null | Receipt number |
| `DocumentType` | string \| null | Document type code |

Field names are matched **case-insensitively** in `parseIpn`.

---

## Rivhit Receipt Fallback

When `RIVHIT_RECEIPT_FALLBACK=on` and the IPN has no `DocumentURL`:

```
POST https://api.rivhit.co.il/online/RivhitOnlineAPI.svc/Document.New
Authorization: api_token = RIVHIT_API_TOKEN
```

```jsonc
{
  "document_type": 2,               // חשבונית מס קבלה
  "request_reference": "<orderId>", // idempotency key
  "prevent_duplicates": true,
  "payment_type": 3,                // RIVHIT_RECEIPT_PAYMENT_TYPE (default 3)
  "language": "he"                  // RIVHIT_LANGUAGE (default "he")
  // ... customer + line item fields
}
```

Response envelope: `{error_code, client_message, debug_message, data}`. `error_code === 0` → `data.document_link` + `data.document_number` stored on the order.

---

## Security Invariants

1. **Cart is re-priced server-side.** `computeStoreTotals` runs in the server action; client-sent prices are never trusted.
2. **GetUrl is server-to-server.** The browser never sees the GroupPrivateToken or prices — it only receives the resulting hosted-page URL.
3. **Verify before marking paid.** The IPN body is not trusted alone. `Status === "VERIFIED"` from the Verify endpoint is required.
4. **Amount double-check.** After Verify, `TransactionAmount` (shekels) is compared to `order.price_total` (agorot). A mismatch returns non-2xx so iCredit retries.
5. **Partial-unique `provider_sale_id` index.** Prevents a replayed IPN from paying the same order twice at the DB level. The `payment_status <> 'paid'` filter in `finalizePaidOrder` is the in-memory fast-path.
6. **Money is agorot internally.** Only converted to shekels at the iCredit/Rivhit edge (`agorotToShekels`). Never stored or compared as floats.

---

## Idempotency

- **`clientRequestId`** (UUID minted by the browser in `sessionStorage`): a partial-unique index on `orders` prevents duplicate rows from double-submit. On a 23505 conflict the winner's order is returned.
- **`finalizePaidOrder`** guards with `WHERE payment_status <> 'paid'` — a second IPN for the same order returns `already_paid` without re-updating.
- **`provider_sale_id`** partial-unique index (WHERE NOT NULL) prevents a single `SaleId` from finalizing multiple orders.

---

## Mock Mode

When `ICREDIT_MODE` is unset or `"mock"`, `getPaymentProvider()` returns the manual provider. `createCheckout` returns `{status:"paid"}` immediately. `finalizePaidOrder` is called inline in the server action — no redirect, no IPN. The browser gets `{ok:true}` directly and navigates to the track page.

---

## File Map

| File | Role |
|---|---|
| `app/actions/store.ts` | Server action: wires admin client, provider, deps |
| `lib/store/confirm-store-order.ts` | Core: validate → price → insert → checkout dispatch |
| `lib/store/pricing.ts` | `computeStoreTotals` — server-authoritative pricing |
| `lib/store/checkout-payload.ts` | `toCheckoutItems`, `toCheckoutCustomer` — pure builders |
| `lib/store/checkout-navigation.ts` | `nextNavigation` — route after mock vs redirect |
| `lib/payments/provider.ts` | `PaymentProvider` interface + `CreateCheckoutInput` types |
| `lib/payments/index.ts` | `getPaymentProvider()` — mock vs iCredit env switch |
| `lib/payments/icredit/config.ts` | `getIcreditConfig()` → `{mode, host, token}` |
| `lib/payments/icredit/client.ts` | `requestPaymentPage` (GetUrl), `verifySale` (Verify) |
| `lib/payments/icredit/provider.ts` | `createIcreditProvider` implementing `PaymentProvider` |
| `lib/payments/icredit/handle-ipn.ts` | `handleIcreditIpn` — all webhook branch logic (DI core) |
| `lib/payments/icredit/ipn.ts` | `parseIpn` — case-insensitive IPN field parser |
| `lib/payments/icredit/money.ts` | `agorotToShekels`, `shekelsToAgorot`, `amountMatches` |
| `lib/payments/rivhit/issue-receipt.ts` | Rivhit `Document.New` fallback |
| `lib/orders/finalize-paid-order.ts` | The one idempotent finalize path for store orders |
| `app/api/payments/icredit/ipn/route.ts` | Next.js POST route — thin handler → `handleIcreditIpn` |
| `components/store/store-checkout.tsx` | Client: submits action; on `redirectUrl` → `window.location.assign` |
