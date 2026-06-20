-- =============================================================================
-- Migration: 0001_orders.sql
-- Line Cut Sticker Shop — orders + order_stickers schema
--
-- Security model (READ THIS):
--   • RLS is ENABLED on both tables (default-deny: no policy = no access).
--   • The two SELECT policies below let authenticated users read their OWN rows.
--   • ALL writes (insert/update/delete) go through Server Actions using the
--     service-role (admin) client, which BYPASSES RLS entirely. No write
--     policies are granted to anon or authenticated roles.
--   • Guest-token reads also go through the admin client, filtered server-side
--     by guest_token. Deliberately NO anon read policy — if the WHERE clause
--     were ever omitted, no leak occurs (default-deny protects us).
--   • Owner operations run behind an is-owner email guard, also via the admin
--     client. No owner-facing policies in the DB layer.
-- =============================================================================

-- =============================================================================
-- ENUMS
-- =============================================================================

-- order_status: lifecycle of a printed sticker order
do $$ begin
  create type order_status as enum (
    'received',
    'in_production',
    'ready',
    'delivered',
    'shipped',
    'cancelled'
  );
exception when duplicate_object then null;
end $$;

-- payment_status: payment lifecycle (deferred-payment model)
do $$ begin
  create type payment_status as enum (
    'awaiting_payment',
    'paid',
    'refunded',
    'waived'
  );
exception when duplicate_object then null;
end $$;

-- delivery_method: how the finished order reaches the customer
do $$ begin
  create type delivery_method as enum (
    'pickup',
    'shipping'
  );
exception when duplicate_object then null;
end $$;

-- =============================================================================
-- TABLE: orders
-- =============================================================================

create table if not exists orders (
  -- Primary key
  id                uuid          primary key default gen_random_uuid(),

  -- Owner (nullable — null means guest order; set null on user deletion so
  -- the order record and its sticker files are preserved for the owner)
  user_id           uuid          references auth.users(id) on delete set null,

  -- Guest access token: an unguessable hex string minted at order creation.
  -- Guests use this token (delivered in the confirmation link) to track their
  -- order. Reads by token are always performed server-side via the admin client,
  -- so no anon read policy is needed — omitting the WHERE clause can't leak rows.
  guest_token       text          not null unique default encode(gen_random_bytes(32), 'hex'),

  -- Order & payment lifecycle
  status            order_status  not null default 'received',
  payment_status    payment_status not null default 'awaiting_payment',

  -- Customer contact info
  contact_name      text          not null,
  contact_email     text          not null,
  contact_phone     text,

  -- Delivery
  delivery_method   delivery_method not null,

  -- Shipping address fields (required only when delivery_method = 'shipping';
  -- see the CHECK constraint below)
  ship_address_line1  text,
  ship_address_line2  text,
  ship_city           text,
  ship_postal_code    text,
  ship_country        text,

  -- Quantity: number of complete sets of all stickers (each set = all unique
  -- sticker designs once)
  copies            int           not null check (copies > 0),

  -- Pricing snapshot (minor units / Israeli agorot — integer arithmetic only;
  -- never numeric/float to avoid rounding drift).
  -- Stored at order-creation time so historical orders are unaffected by future
  -- rate changes.
  price_sheets      int           not null,   -- total number of A4 sheets
  price_rate        int           not null,   -- rate per sheet in agorot
  price_setup       int           not null default 0, -- one-time setup fee in agorot
  price_currency    text          not null default 'ILS',
  price_total       int           not null,   -- total charge = sheets×rate + setup

  -- Timestamps
  created_at        timestamptz   not null default now(),
  updated_at        timestamptz   not null default now(),

  -- null = draft (upload in progress); non-null = confirmed order
  confirmed_at      timestamptz,

  -- Shipping address required when delivery_method = 'shipping'.
  -- Pickup orders may leave all ship_* fields null.
  constraint orders_shipping_address_required check (
    delivery_method = 'pickup'
    or (
      ship_address_line1 is not null
      and ship_city       is not null
      and ship_postal_code is not null
    )
  )
);

comment on table orders is
  'Sticker print orders. Drafts have confirmed_at IS NULL and are swept by a '
  'cleanup cron after 24 h. All writes via service-role client (bypasses RLS).';

comment on column orders.guest_token is
  'Unguessable token for guest order tracking. Never exposed via an anon SELECT '
  'policy — guest reads go through the admin client, filtered by this value.';

comment on column orders.price_total is
  'Total charge in minor units (agorot). Snapshot at confirmation time; never '
  'recomputed from live rates so historical orders are stable.';

-- =============================================================================
-- TABLE: order_stickers
-- =============================================================================

create table if not exists order_stickers (
  id                uuid    primary key default gen_random_uuid(),

  -- Cascade delete: removing the parent order removes all sticker rows and
  -- the caller must also clean up S3 objects for the same order prefix.
  order_id          uuid    not null references orders(id) on delete cascade,

  -- Full S3 object key: {clientKey}/{orderId}/{stickerId}.webp
  -- where clientKey = u_{userId} (logged-in) or g_{guestToken} (guest)
  storage_key       text    not null,

  -- Filename as supplied by the customer's device
  original_filename text    not null,

  -- Image dimensions (pixels) — may be null if not probed on upload
  width             int,
  height            int,

  -- File size in bytes (not null — always known from the upload metadata)
  bytes             int     not null,

  -- MIME type; all stickers should be image/webp
  content_type      text    not null default 'image/webp',

  -- Position of this sticker within the order (0-based)
  sort_index        int     not null default 0,

  created_at        timestamptz not null default now()
);

comment on table order_stickers is
  'One row per sticker file within an order. storage_key is the full S3 object '
  'key. Deleting the parent order cascades here; caller must also run '
  'deletePrefix() on S3 to reclaim storage.';

-- =============================================================================
-- INDEXES
-- =============================================================================

-- Fast lookup of all orders belonging to a user (authenticated reads)
create index if not exists orders_user_id_idx
  on orders(user_id);

-- guest_token uniqueness is already enforced by the UNIQUE constraint above,
-- which implicitly creates a B-tree index. No separate index needed.

-- Fast ordered retrieval of stickers within an order (used for grid display
-- and A4 layout computation)
create index if not exists order_stickers_order_id_sort_idx
  on order_stickers(order_id, sort_index);

-- =============================================================================
-- UPDATED_AT TRIGGER
-- =============================================================================

-- Function: set_updated_at
-- Automatically stamps updated_at on every UPDATE to the orders table.
create or replace function set_updated_at()
  returns trigger
  language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- Drop then recreate so the migration is re-runnable without errors.
drop trigger if exists orders_set_updated_at on orders;

create trigger orders_set_updated_at
  before update on orders
  for each row
  execute function set_updated_at();

-- =============================================================================
-- ROW-LEVEL SECURITY
-- =============================================================================

-- Enable RLS — default-deny: no policy = no access for any role.
alter table orders           enable row level security;
alter table order_stickers   enable row level security;

-- ---- orders: authenticated SELECT (own orders only) -------------------------
--
-- Authenticated users may SELECT rows where user_id matches their JWT subject.
-- We wrap auth.uid() in a sub-select to prevent Postgres from re-evaluating
-- it per-row (a Supabase-recommended performance pattern).
--
-- NO insert / update / delete policies for authenticated or anon:
--   • Writes go through the service-role (admin) client in Server Actions.
--   • Anon has no read policy either — guest reads are server-side + admin
--     client filtered by guest_token.

drop policy if exists "own orders read" on orders;

create policy "own orders read"
  on orders
  for select
  to authenticated
  using (user_id = (select auth.uid()));

-- ---- order_stickers: authenticated SELECT (stickers of own orders only) -----
--
-- Uses an EXISTS subquery so the join on orders.user_id is evaluated once
-- per order rather than once per sticker row.

drop policy if exists "own order stickers read" on order_stickers;

create policy "own order stickers read"
  on order_stickers
  for select
  to authenticated
  using (
    exists (
      select 1
      from orders o
      where o.id       = order_stickers.order_id
        and o.user_id  = (select auth.uid())
    )
  );

-- =============================================================================
-- END OF MIGRATION
-- =============================================================================
