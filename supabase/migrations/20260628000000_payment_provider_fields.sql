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
