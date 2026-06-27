-- =============================================================================
-- Migration: store_products
-- Line Cut — store catalog (admin-managed products) + generic order line items,
-- generalizing the sticker-only order system to also support cart-based store
-- orders WITHOUT disturbing the existing sticker flow.
--
-- Security model (READ THIS):
--   • products are PUBLIC catalog data: an anon SELECT policy exposes only
--     status='active' rows. This does NOT weaken the orders model — products
--     carry no customer PII; the public is the intended audience. There is
--     still NO write policy (catalog writes go through the service-role client).
--   • product IMAGES live in a public-read AWS S3 bucket (S3_PRODUCTS_BUCKET),
--     written by the existing IAM user via presigned PUT — NOT in Postgres or
--     Supabase Storage. Nothing storage-related is provisioned by this migration.
--   • order_items follow order_stickers exactly: authenticated read of OWN rows
--     via an EXISTS join on orders; NO anon read policy. Guest reads + all
--     writes go through the service-role (admin) client, filtered by guest_token.
--   • orders gains an order_kind discriminator (default 'stickers') so existing
--     inserts and rows are unaffected. The sticker-only price columns are
--     relaxed to NULL for store orders, re-asserted for stickers via a
--     kind-gated CHECK.
-- =============================================================================

-- =============================================================================
-- ENUMS
-- =============================================================================

-- product_status: catalog lifecycle. Only 'active' products are shown publicly.
do $$ begin
  create type product_status as enum (
    'draft',
    'active',
    'archived'
  );
exception when duplicate_object then null;
end $$;

-- order_kind: which product line an order belongs to.
do $$ begin
  create type order_kind as enum (
    'stickers',
    'store'
  );
exception when duplicate_object then null;
end $$;

-- Extend the existing order_status with an 'acknowledged' step so the owner can
-- mark an order as seen before it enters production. ADD VALUE must be its own
-- statement and (in a transaction) the value may not be USED until commit — we
-- never reference 'seen' later in this migration, so this is safe on PG12+.
alter type order_status add value if not exists 'seen' after 'received';

-- =============================================================================
-- TABLE: products  (admin-managed store catalog)
-- =============================================================================

create table if not exists products (
  id              uuid           primary key default gen_random_uuid(),

  -- URL slug for /[lang]/store/<slug>. Unique, owner-controlled.
  slug            text           not null unique,

  -- Catalog lifecycle. draft/archived are hidden from the public storefront
  -- (the RLS policy below only exposes 'active').
  status          product_status not null default 'draft',

  -- Bilingual content (mirrors the two physical dictionary files + parity test).
  title_he        text           not null,
  title_en        text           not null,
  description_he  text           not null default '',
  description_en  text           not null default '',

  -- Price in minor units (agorot) — integer arithmetic only, never numeric/float.
  price           int            not null default 0 check (price >= 0),
  currency        text           not null default 'ILS',

  -- Primary public image URL (Supabase Storage public bucket). Optional galleries
  -- live in `images` as [{ url, sortIndex }]. Option groups live in `options` as
  -- [{ key, labelHe, labelEn, choices:[{ value, labelHe, labelEn, priceDelta }] }].
  image_url       text,
  images          jsonb          not null default '[]'::jsonb,
  options         jsonb          not null default '[]'::jsonb,

  -- Display order in the storefront grid (ascending).
  sort_index      int            not null default 0,

  created_at      timestamptz    not null default now(),
  updated_at      timestamptz    not null default now(),

  -- An active (publicly shown) product must have a primary image.
  constraint products_active_needs_image
    check (status <> 'active' or image_url is not null)
);

comment on table products is
  'Admin-managed store catalog. Public read of status=active rows via RLS; all '
  'writes via the service-role client behind an is-owner email guard.';

-- Fast storefront listing (active rows, ordered) and admin listing.
create index if not exists products_status_sort_idx
  on products(status, sort_index);

-- Reuse the shared updated_at trigger function defined in the orders migration.
drop trigger if exists products_set_updated_at on products;
create trigger products_set_updated_at
  before update on products
  for each row
  execute function set_updated_at();

-- =============================================================================
-- TABLE: order_items  (generic line items for store orders)
-- =============================================================================

create table if not exists order_items (
  id            uuid    primary key default gen_random_uuid(),

  -- Cascade delete with the parent order (mirrors order_stickers).
  order_id      uuid    not null references orders(id) on delete cascade,

  -- The catalog product this line refers to. SET NULL on product deletion: the
  -- snapshots below keep the historical line intact even if the product is gone.
  product_id    uuid    references products(id) on delete set null,

  -- Snapshots taken at order time so deleting/archiving a product never corrupts
  -- past orders (bilingual title kept so tracking stays bilingual after deletion).
  title_he      text    not null,
  title_en      text    not null,
  image_url     text,

  -- The buyer's selected option values, snapshotted: { "<groupKey>": "<value>" }.
  options       jsonb   not null default '[]'::jsonb,

  -- Quantity and snapshotted unit/line price (agorot).
  quantity      int     not null check (quantity > 0),
  unit_price    int     not null check (unit_price >= 0),
  line_total    int     not null check (line_total >= 0),

  sort_index    int     not null default 0,
  created_at    timestamptz not null default now(),

  -- Belt-and-suspenders against a tampered total reaching the DB.
  constraint order_items_line_total_matches
    check (line_total = unit_price * quantity)
);

comment on table order_items is
  'One row per cart line in a store order. Title/price/image are snapshots so '
  'archiving or deleting a product never alters past orders. Same RLS as '
  'order_stickers (auth read own; guest reads + writes via admin client).';

create index if not exists order_items_order_id_sort_idx
  on order_items(order_id, sort_index);

-- =============================================================================
-- ALTER: orders — generalize for store orders
-- =============================================================================

-- Discriminator. Default 'stickers' backfills every existing row and keeps the
-- existing create-draft insert (which omits this column) working unchanged.
alter table orders add column if not exists order_kind order_kind not null default 'stickers';

-- Client-minted idempotency key for create-at-confirm store orders (store has no
-- draft row to short-circuit a double submit on, unlike sticker confirm).
alter table orders add column if not exists client_request_id text;
create unique index if not exists orders_client_request_id_uidx
  on orders(client_request_id) where client_request_id is not null;

-- Relax the sticker-only price columns so store orders (which have none of them)
-- can be inserted. DROP NOT NULL, never DEFAULT 0 — `copies` has CHECK (copies>0)
-- which a 0 would fail, but a CHECK passes when its operand is NULL. price_total
-- and price_currency stay NOT NULL and serve both kinds.
alter table orders alter column copies       drop not null;
alter table orders alter column price_sheets drop not null;
alter table orders alter column price_rate   drop not null;

-- Re-assert the sticker invariant only for sticker orders. Existing rows are all
-- order_kind='stickers' with these fields populated, so this validates cleanly.
do $$ begin
  alter table orders
    add constraint orders_sticker_fields_required
    check (
      order_kind <> 'stickers'
      or (copies is not null and price_sheets is not null and price_rate is not null)
    );
exception when duplicate_object then null;
end $$;

-- =============================================================================
-- ROW-LEVEL SECURITY
-- =============================================================================

alter table products    enable row level security;
alter table order_items enable row level security;

-- ---- products: PUBLIC read of ACTIVE rows (anon + authenticated). No writes. --
-- Catalog data is intentionally world-readable; draft/archived rows are hidden
-- by the predicate. No write policy ⇒ catalog mutations are service-role only.
drop policy if exists "active products are public" on products;
create policy "active products are public"
  on products
  for select
  to anon, authenticated
  using (status = 'active');

-- ---- order_items: authenticated SELECT (items of own orders only) -----------
-- Same pattern as order_stickers. NO anon policy — guest reads + all writes go
-- through the service-role (admin) client filtered by guest_token.
drop policy if exists "own order items read" on order_items;
create policy "own order items read"
  on order_items
  for select
  to authenticated
  using (
    exists (
      select 1
      from orders o
      where o.id      = order_items.order_id
        and o.user_id = (select auth.uid())
    )
  );

-- Product images: NOT provisioned here. They live in a public-read AWS S3
-- bucket (S3_PRODUCTS_BUCKET) you create manually; the existing IAM user writes
-- to it via presigned PUT, and the storefront reads the public object URL.

-- =============================================================================
-- END OF MIGRATION
-- =============================================================================
