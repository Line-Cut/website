-- =============================================================================
-- Migration: feature_access
-- DB-managed, admin-controlled access to gated features (the sticker shop and
-- the store). Replaces the old STICKER_SHOP_PUBLIC / STICKER_SHOP_ALLOWED_EMAILS
-- env vars. Managed from /admin/access.
--
-- Security model (same as `admins`):
--   • RLS ENABLED with NO policies (default-deny): anon + authenticated get zero
--     access. The app reads/writes only via the service-role (admin) client,
--     behind the isAdmin()/isCurrentUserAdmin() guards. Feature gating is an
--     app-layer check — it does NOT change orders/products RLS.
-- =============================================================================

-- One row per gated feature: the public/restricted switch.
create table if not exists feature_access (
  feature     text        primary key,
  visibility  text        not null check (visibility in ('public', 'restricted')),
  updated_at  timestamptz not null default now()
);

comment on table feature_access is
  'Per-feature visibility switch (public | restricted), admin-managed. '
  'Service-role only; RLS default-deny.';

-- Stamp updated_at on every UPDATE (reuses set_updated_at() from the orders migration).
drop trigger if exists feature_access_set_updated_at on feature_access;
create trigger feature_access_set_updated_at
  before update on feature_access
  for each row execute function set_updated_at();

-- Who may use a restricted feature. Keyed by registered auth user.
create table if not exists feature_allowlist (
  feature     text        not null references feature_access(feature) on delete cascade,
  user_id     uuid        not null references auth.users(id) on delete cascade,
  -- Email snapshot at grant time so the manage UI can list without querying auth.
  email       text        not null,
  -- Who granted (an admin/owner). Audit only.
  granted_by  uuid        references auth.users(id) on delete set null,
  created_at  timestamptz not null default now(),
  primary key (feature, user_id)
);

comment on table feature_allowlist is
  'Registered users allowed to use a restricted feature. Service-role only; RLS default-deny.';

alter table feature_access    enable row level security;
alter table feature_allowlist enable row level security;
-- Deliberately NO policies on either table — service-role only.

-- -----------------------------------------------------------------------------
-- Seed: match today's behavior so nothing changes on deploy.
--   • stickers = restricted (was the env default), store = public.
-- -----------------------------------------------------------------------------
insert into feature_access (feature, visibility) values
  ('stickers', 'restricted'),
  ('store',    'public')
on conflict (feature) do nothing;

-- Best-effort: seed the sticker allow-list from the two former default emails,
-- but only for accounts that already exist. Missing ones are added later in the
-- /admin/access UI once those users sign up.
insert into feature_allowlist (feature, user_id, email)
select 'stickers', u.id, u.email
from auth.users u
where lower(u.email) in ('yuval.altun101@gmail.com', 'linecut1973@gmail.com')
on conflict (feature, user_id) do nothing;

-- =============================================================================
-- END OF MIGRATION
-- =============================================================================
