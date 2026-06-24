-- =============================================================================
-- Migration: phone_friendly_storage_payment
-- Line Cut Sticker Shop — enforce required phone, split contact name, record the
-- friendly S3 folder name, and add payment/receipt columns.
--
-- Context:
--   • Phone is already required at the app layer (checkout schema). This adds a
--     DB-level guarantee for CONFIRMED orders (drafts may still be NULL).
--   • At confirmation the order's files are re-keyed under a friendly folder
--     <orderId>-<first>-<last>-<phone>; we store that prefix on the row.
--   • Payment is mocked today but writes a reference + paid_at + receipt key, so
--     the columns exist now for the real (non-standard) provider later.
-- =============================================================================

-- Split contact name (kept contact_name populated as "<first> <last>" for the
-- owner email + existing read views).
alter table orders add column if not exists contact_first_name text;
alter table orders add column if not exists contact_last_name  text;

-- Friendly S3 folder name for this order, shared by the orders and paid buckets.
-- Set at confirmation (re-key step). NULL for drafts.
alter table orders add column if not exists storage_prefix text;

-- Payment / receipt bookkeeping (populated by the paid pipeline).
alter table orders add column if not exists payment_reference   text;
alter table orders add column if not exists paid_at             timestamptz;
alter table orders add column if not exists receipt_storage_key text;
alter table orders add column if not exists payment_meta        jsonb;

comment on column orders.storage_prefix is
  'Friendly S3 folder name <orderId>-<first>-<last>-<phone> (sanitized). Same '
  'relative prefix in both the orders and paid buckets. Set at confirmation.';
comment on column orders.payment_reference is
  'Provider transaction reference. Mocked today (MOCK-<orderId>); real value '
  'arrives with the non-standard payment provider.';
comment on column orders.receipt_storage_key is
  'S3 key of the receipt file inside the paid bucket order folder.';

-- DB-level enforcement of the required phone for CONFIRMED orders. Drafts
-- (confirmed_at IS NULL) may leave contact_phone NULL. Idempotent add.
do $$ begin
  alter table orders
    add constraint orders_phone_required_when_confirmed
    check (confirmed_at is null or contact_phone is not null);
exception when duplicate_object then null;
end $$;

-- =============================================================================
-- END OF MIGRATION
-- =============================================================================
