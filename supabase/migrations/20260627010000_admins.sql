-- =============================================================================
-- Migration: admins
-- DB-managed admin grants, layered on top of the OWNER_NOTIFY_EMAIL env
-- "bootstrap" superadmin (which is always admin and can never be locked out).
--
-- Security model:
--   • RLS is ENABLED with NO policies (default-deny): anon + authenticated get
--     zero access. The app reads/writes this table only via the service-role
--     (admin) client, behind the isCurrentUserAdmin() guard — same pattern as
--     orders. There is nothing user-facing to read here directly.
-- =============================================================================

create table if not exists admins (
  -- The admin user. Cascade-delete if the auth user is removed.
  user_id     uuid        primary key references auth.users(id) on delete cascade,

  -- Email snapshot at grant time, so the manage-admins UI can list admins
  -- without querying the auth schema.
  email       text        not null,

  -- Who granted this admin (an env owner or another admin). Kept for audit.
  granted_by  uuid        references auth.users(id) on delete set null,

  created_at  timestamptz not null default now()
);

comment on table admins is
  'DB-managed admin grants (in addition to the OWNER_NOTIFY_EMAIL env bootstrap). '
  'All access via the service-role client behind the admin guard; RLS default-deny.';

alter table admins enable row level security;
-- Deliberately NO policies — service-role only.

-- =============================================================================
-- END OF MIGRATION
-- =============================================================================
