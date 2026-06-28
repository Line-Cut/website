# Rivhit Online REST API — Field Reference (Document.New)

We only use the `Document.New` endpoint (document type 2 = חשבונית מס קבלה) as a **fallback** when iCredit does not auto-issue a receipt via the IPN. This is the `issueInvoiceReceipt` path in `lib/payments/rivhit/issue-receipt.ts`.

## Base URL

`https://api.rivhit.co.il/online/RivhitOnlineAPI.svc`

Auth: `api_token` (GUID) in request body. POST, HTTPS only, `Content-Type: application/json`.

## Document.New Request

`POST {base}/Document.New`

| Field | Type | Value / Notes |
|---|---|---|
| `api_token` | string | From `RIVHIT_API_TOKEN` env var |
| `document_type` | int | `2` = חשבונית מס קבלה (invoice-receipt) |
| `price_include_vat` | bool | `true` |
| `first_name` | string | Customer first name |
| `last_name` | string | Customer last name |
| `items` | array | Line items (see below) |
| `payments` | array | Payment entries (see below) |
| `request_reference` | string | Our `orderId` — used for idempotency |
| `prevent_duplicates` | bool | `true` — re-sending the same `request_reference` returns an error instead of issuing a duplicate |
| `language` | string | `"he"` (default) or `"en"` — from `RIVHIT_LANGUAGE` env var |
| `send_mail` | bool | `false` (we surface the URL ourselves) |

### Items Array

| Field | Type | Notes |
|---|---|---|
| `description` | string | Line item description (title_he preferred, falls back to title_en) |
| `price_nis` | number | Unit price in shekels (from `agorotToShekels(unit_price)`) |
| `quantity` | int | Unit count |

### Payments Array

| Field | Type | Notes |
|---|---|---|
| `payment_type` | int | From `RIVHIT_RECEIPT_PAYMENT_TYPE` env var (default `3`) |
| `amount_nis` | number | Total amount in shekels (`agorotToShekels(price_total)`) |

## Envelope Response

All Rivhit responses follow this envelope:

```json
{
  "error_code": 0,
  "client_message": "...",
  "debug_message": "...",
  "data": { ... }
}
```

`error_code === 0` = success. Non-zero = failure (`client_message` + `debug_message` carry the reason).

### Document.New `data` on success

| Field | Type | Notes |
|---|---|---|
| `document_type` | int | `2` |
| `document_number` | string/int | Human-facing receipt number → `receipt_document_number` |
| `document_link` | string | PDF URL → `receipt_document_url` |
| `document_identity` | string | GUID |
| `print_status` | string | Print status |
| `customer_id` | int | Rivhit customer ID |

## Idempotency

Sending `request_reference = orderId` with `prevent_duplicates: true` ensures a retry does not issue a duplicate receipt. A re-send returns a non-zero `error_code` with a message indicating a duplicate was prevented; this is safe to ignore (the first call succeeded).

## Other Available Endpoints (not used)

- `Receipt.New` (קבלה only, type not 2) — we need the combined invoice-receipt (type 2).
- `Document.TypeList` / `Receipt.TypeList` — enumerate available document types.
