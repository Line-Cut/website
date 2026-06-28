# iCredit Payment Pages — Field Reference

Condensed from the Rivhit/iCredit spec and confirmed against the test sandbox 2026-06-28.

## GetUrl Request Fields

`POST https://{host}/API/PaymentPageRequest.svc/GetUrl` — `Content-Type: application/json`.

| Field | Type | Required | Notes |
|---|---|---|---|
| `GroupPrivateToken` | string (GUID) | yes | Auth token — matches `ICREDIT_GROUP_PRIVATE_TOKEN` |
| `Items` | array | yes | Line items (see below) |
| `RedirectURL` | string | yes | Absolute URL buyer is sent to after payment |
| `IPNURL` | string | yes | Absolute URL iCredit POSTs the IPN to |
| `Custom1` | string | yes | Our orderId — echoed back in IPN |
| `DocumentLanguage` | `"he"` \| `"en"` | yes | Language for the hosted page and receipt |
| `ExemptVAT` | bool | yes | `false` = VAT-inclusive (standard) |
| `HideItemList` | bool | yes | `false` = buyer sees itemised list (cannot edit) |
| `EmailAddress` | string | yes | Buyer email |
| `CustomerFirstName` | string | yes | Buyer first name |
| `CustomerLastName` | string | yes | Buyer last name |
| `PhoneNumber` | string | recommended | Buyer phone |
| `Address` | string | optional | Buyer street address |
| `City` | string | optional | Buyer city |
| `Zipcode` | string | optional | Buyer postal code |
| `Order` | string | optional | Set to orderId for reference |
| `Reference` | string | optional | Additional reference string |
| `MaxPayments` | int | optional | Maximum installments (1 = single payment) |
| `Discount` | number | optional | Discount amount in shekels |
| `CreateToken` | bool | optional | `false` — we do not store card tokens |
| `Custom2`–`Custom9` | string | optional | Additional pass-through fields (echoed in IPN) |

### Items Array

Each element:

| Field | Type | Notes |
|---|---|---|
| `Id` | int | Always `0` |
| `CatalogNumber` | string | Product ID or SKU (empty string if none) |
| `UnitPrice` | number | Per-unit price in **shekels** (2-decimal) — NOT agorot |
| `Quantity` | int | Unit count |
| `Description` | string | Line item description |

Total charged = Σ(`UnitPrice` × `Quantity`) − `Discount`.

## GetUrl Response (confirmed shape)

```json
{
  "Status": 0,
  "URL": "https://testicredit.rivhit.co.il/payment/PaymentItems.aspx?GroupId=...&Token=...",
  "PublicSaleToken": "<guid>",
  "PrivateSaleToken": "<guid>",
  "DebugMessage": null
}
```

| Field | Meaning |
|---|---|
| `Status` | `0` = success; non-zero = failure |
| `URL` | Hosted payment page — redirect the buyer here |
| `PublicSaleToken` | Used as `payment_reference` on the order |
| `PrivateSaleToken` | Not used by our integration |
| `DebugMessage` | Error description when `Status !== 0`; null on success |

## Verify Request + Response

`POST https://{host}/API/PaymentPageRequest.svc/Verify`

Request:
```json
{
  "GroupPrivateToken": "<guid>",
  "SaleId": "<guid>",
  "TotalAmount": 123.45
}
```
(`TotalAmount` in **shekels**, 2-decimal.)

Response (HTTP 200 either way):
```json
{ "Status": "VERIFIED" }    // real paid sale
{ "Status": "NOTVERIFIED" } // not paid / replay
```

## IPN Fields (iCredit → IPNURL, HTTP POST form-encoded)

IPN key casing from a live call is unverified — always look up case-insensitively (`parseIpn` handles this).

| Field | Meaning |
|---|---|
| `SaleId` | iCredit sale GUID — stored as `provider_sale_id` |
| `GroupPrivateToken` | Must match our configured token |
| `TransactionAmount` | Amount charged in **shekels** |
| `Custom1` | Our orderId (from GetUrl `Custom1`) |
| `TransactionAuthNum` | Authorization number — stored as `payment_reference` |
| `DocumentURL` | Receipt PDF URL (when auto-issued) → `receipt_document_url` |
| `DocumentNum` | Receipt document number → `receipt_document_number` |
| `DocumentType` | `"2"` = חשבונית מס קבלה |
| `TransactionToken` | Card token (not used) |
| `Custom2`–`Custom9` | Pass-through (not used) |

## Hosts

| `ICREDIT_MODE` | Host |
|---|---|
| `test` | `https://testicredit.rivhit.co.il` |
| `prod` | `https://icredit.rivhit.co.il` |
