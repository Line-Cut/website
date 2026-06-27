# Feature Access — DB-backed, admin-managed whitelisting

**Date:** 2026-06-27
**Status:** Approved (design) — pending implementation plan

## Problem

The sticker shop is gated by an **env-only** allow-list (`STICKER_SHOP_PUBLIC` +
`STICKER_SHOP_ALLOWED_EMAILS`, with hard-coded default emails, in
`lib/auth/sticker-access.ts`). The store is fully public with no gate.

The owner wants to **whitelist the store the same way**, and — now that an admin
section exists — **manage all of this in the admin UI** instead of via env vars:
per feature, choose **public vs restricted**, and (when restricted) choose
**which users** may use it.

## Decisions (locked)

1. **Whitelist by registered account (`user_id`)** — same as the `admins` table:
   the owner adds a user by email, we look up the existing auth account and store
   its `user_id` (plus an `email` snapshot for display). You can only whitelist
   someone who already has an account; not-yet-registered emails are added once
   they sign up. (Chosen over email-only.)
2. **DB is the single source of truth — drop the env vars.** Remove
   `STICKER_SHOP_PUBLIC` / `STICKER_SHOP_ALLOWED_EMAILS` from code, `.env.example`,
   docs, and both skills. A migration seeds the DB to match today's behavior.
3. **One "Feature access" admin page** lists each feature with a Public/Restricted
   toggle and an inline allow-list editor (mirrors the existing admins-manager).
4. **Admins/owners bypass all feature gates** (an admin managing the store must be
   able to see it). Owner = `OWNER_NOTIFY_EMAIL` env bootstrap; admin = owner OR a
   row in `admins`. Unchanged; this system layers on top.
5. **Header hides restricted feature links** from users who aren't allowed (admins
   always see them) — no dangling links that bounce to login.
6. **Track pages stay open** (`store/track/[token]`, `stickers/track/[token]`) —
   they are token-gated; a customer who already ordered must not be locked out if
   the feature later goes restricted.

## Feature registry (code-side source of truth)

`lib/auth/feature-access.ts` exports:

```ts
export const FEATURES = [
  { key: "stickers", defaultVisibility: "restricted" },
  { key: "store",    defaultVisibility: "public" },
] as const;

export type FeatureKey = (typeof FEATURES)[number]["key"]; // "stickers" | "store"
export type FeatureVisibility = "public" | "restricted";
```

The registry is the canonical list of features and each feature's **fallback
default** when no DB row exists yet (defence in depth — a freshly deployed feature
key that hasn't been seeded still behaves sensibly). Adding a feature later is a
code change here + a seed row; the admin UI iterates `FEATURES`.

## Data model (new migration `<ts>_feature_access.sql`)

Both tables use **RLS enabled with NO policies (default-deny)** — read/written
only through the service-role (admin) client behind the admin guard, exactly like
`admins`. Nothing user-facing reads them directly.

### `feature_access` — the visibility switch (one row per feature)

| column      | type          | notes                                             |
|-------------|---------------|---------------------------------------------------|
| `feature`   | `text` PK     | `'stickers'` \| `'store'`                          |
| `visibility`| `text` NOT NULL | `check (visibility in ('public','restricted'))`  |
| `updated_at`| `timestamptz` | reuse the existing `set_updated_at` trigger fn    |

### `feature_allowlist` — who may use a restricted feature

| column       | type          | notes                                            |
|--------------|---------------|--------------------------------------------------|
| `feature`    | `text`        | `references feature_access(feature) on delete cascade` |
| `user_id`    | `uuid`        | `references auth.users(id) on delete cascade`    |
| `email`      | `text` NOT NULL | snapshot for the UI list (like `admins.email`)  |
| `granted_by` | `uuid`        | `references auth.users(id) on delete set null` (audit) |
| `created_at` | `timestamptz` | `default now()`                                  |
| PRIMARY KEY  | `(feature, user_id)` |                                           |

### Seed (matches current behavior — no change on deploy)

```sql
insert into feature_access (feature, visibility) values
  ('stickers','restricted'),
  ('store','public')
on conflict (feature) do nothing;

-- Best-effort: seed the sticker allow-list from the 2 current default emails,
-- but only for accounts that already exist. Missing ones are added later in UI.
insert into feature_allowlist (feature, user_id, email)
select 'stickers', u.id, u.email
from auth.users u
where lower(u.email) in ('yuval.altun101@gmail.com','linecut1973@gmail.com')
on conflict (feature, user_id) do nothing;
```

## Auth module `lib/auth/feature-access.ts` (replaces `sticker-access.ts`)

`"server-only"`. Uses the service-role admin client and reuses `isAdmin` from
`lib/auth/admin-access.ts`.

- **Pure core (unit-tested, no IO):**
  ```ts
  evaluateFeatureAccess(input: {
    isAdmin: boolean;
    visibility: FeatureVisibility;
    userId: string | null;
    allowedUserIds: ReadonlySet<string>;
  }): boolean
  ```
  Rule: `isAdmin` → true; else `public` → true; else (`restricted`) →
  `userId != null && allowedUserIds.has(userId)`.
- **IO wrappers:**
  - `getFeatureVisibility(feature): Promise<FeatureVisibility>` — read
    `feature_access`; fall back to the registry default if the row is absent.
  - `isFeatureAllowed(feature, user): Promise<boolean>` — compose `isAdmin(user)`
    + visibility + (only when restricted) an allow-list lookup. Skips the
    allow-list query when public or when the user is an admin.
  - `getCurrentUserFeatureAccess(feature): Promise<{ allowed: boolean; user }>` —
    fetches the session itself and returns both (mirrors the old
    `checkStickerAccess` shape; used by server actions).

## Enforcement points

**Stickers (refactor from env to DB):**
- `app/[lang]/stickers/page.tsx`, `app/[lang]/stickers/checkout/page.tsx` — replace
  `isStickerShopRestricted()/isStickerShopUser()` with `isFeatureAllowed('stickers', user)`.
  Same redirect: guest → `/${lang}/login`, signed-in-not-allowed → `/${lang}`.
- `app/actions/stickers.ts` — `checkStickerAccess()` →
  `getCurrentUserFeatureAccess('stickers')`; denials still return
  `{ ok:false, message:"forbidden" }`.

**Store (new gate):**
- `app/[lang]/store/page.tsx`, `store/[slug]/page.tsx`, `store/cart/page.tsx`,
  `store/checkout/page.tsx` — add `isFeatureAllowed('store', user)` with the same
  redirect behavior.
- `app/actions/store.ts` — `quoteStoreCart` and `confirmStoreOrder` re-check
  `getCurrentUserFeatureAccess('store')` and return `forbidden` when denied.
- `store/track/[token]` — **unchanged** (token-gated, stays open).

**Header nav:**
- `app/[lang]/layout.tsx` computes `canSeeStore` / `canSeeStickers` (via
  `isFeatureAllowed`) for the current user and passes them to `Header`.
- `components/layout/header.tsx` hides the Store / Sticker shop links (desktop +
  mobile) when the corresponding flag is false. The cart badge follows the store
  flag. Admins/owners always see both.

## Admin UI

- `app/[lang]/admin/access/page.tsx` — admin-gated (same pattern as
  `admin/admins/page.tsx`); `AdminNav` gains a **"Feature access"** item
  (`current="access"`).
- `components/admin/feature-access-manager.tsx` — per feature: display name, a
  **Public / Restricted** toggle, and — when restricted — an inline allow-list
  editor (email input → add; list of allowed users with a remove button). Mirrors
  `components/admin/admins-manager.tsx`.
- `app/actions/feature-access.ts` (all admin-gated via `isCurrentUserAdmin()`):
  - `listFeatureAccess(): Promise<FeatureAccessView[]>` — each feature with its
    visibility + allow-list rows (`userId`, `email`, `createdAtISO`).
  - `setFeatureVisibility(feature, visibility)` — upsert `feature_access`.
  - `addFeatureAllowedUser(feature, email)` — look up the account by email; insert
    an allow-list row. Errors: `invalid_email`, `user_not_found`, `db_error`.
  - `removeFeatureAllowedUser(feature, userId)` — delete the allow-list row.
- **Refactor:** extract the private `findUserByEmail` from `app/actions/admins.ts`
  into a shared `lib/auth/find-user.ts`; reuse it in both `admins.ts` and
  `feature-access.ts`.

## Cleanup, i18n, docs

- **Delete** `lib/auth/sticker-access.ts` and `lib/auth/sticker-access.test.ts`.
- Remove `STICKER_SHOP_PUBLIC` / `STICKER_SHOP_ALLOWED_EMAILS` from `.env.example`,
  `docs/sticker-shop-setup.md`, and the `sticker-shop` / `linecut-website` skills;
  document the DB feature-access system in their place.
- Add an `admin.access` dictionary slice (heading, feature names Store/Stickers,
  Public/Restricted labels, allow-list add/remove labels, error messages) and an
  `admin.nav.access` label to **both** `app/[lang]/dictionaries/he.json` and
  `en.json` — identical shape (the vitest parity test must pass).
- Update `supabase/migrations/README.md` (the two new default-deny tables).

## Invariants preserved

- **`orders`/`order_items`/`admins`/feature-access tables stay default-deny, no anon
  read** — only `products` has a public policy. Feature gates are an app-layer
  check, not RLS, and do not change product/order RLS.
- **Admins/owners bypass all gates.** Owner env bootstrap can never be locked out.
- **Sticker order cores untouched** — only the access guard at the page/action
  edge changes; the create-draft/confirm flow is unaffected.
- **Money/agorot, snapshots, server-authoritative pricing** — out of scope, unchanged.

## Testing & verification

- Unit-test the pure `evaluateFeatureAccess` (admin bypass; public; restricted with
  in/out of allow-list; null user).
- Update/replace sticker tests that referenced the env gate.
- Dictionary parity test stays green (he/en identical shape).
- `npm run test`, `npm run typecheck`, `npm run build`.
- Apply migration (`npm run db:push`); verify in SQL: anon sees zero rows in both
  new tables; seed produced `stickers=restricted` + `store=public`.
- Manual e2e (`/he` + `/en`, RTL `scrollWidth === clientWidth`):
  - Store public (default): guest browses + orders as today.
  - Owner flips store to **restricted** in `/admin/access`: guest hitting `/store`
    → login; signed-in non-allowed → home; Store link hidden in header; admin still
    sees it. Add an allowed user → they regain access. A previously placed order's
    `track` link still works.
  - Stickers behaves exactly as before (restricted), now driven by the DB seed.

## Out of scope (future)

- Per-feature roles beyond a single allow-list (e.g. tiers/quotas).
- Email-based pre-authorization of not-yet-registered users (chose user_id model).
- Auditing/history of access changes beyond `granted_by`/`created_at`.
- Notifying a user when they're granted access.
