# Feature Access Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the env-only sticker allow-list with a DB-backed, admin-managed feature-access system (per-feature public/restricted + a registered-user allow-list) covering both the store and the sticker shop.

**Architecture:** A code-side `FEATURES` registry + two default-deny tables (`feature_access`, `feature_allowlist`) read/written only through the service-role client. A pure `evaluateFeatureAccess` core encodes the rule (admins bypass → public → restricted-and-allow-listed); thin IO wrappers and a `/admin/access` UI sit on top. Gates live at the page edge (redirect) and in the server actions (defense in depth), exactly mirroring today's sticker gate.

**Tech Stack:** Next.js 16 App Router (RSC + Server Actions), React 19, TypeScript, Supabase (Postgres + Auth + service-role client), Tailwind v4, vitest. Spec: `docs/superpowers/specs/2026-06-27-feature-access-design.md`.

## Global Constraints

- **This is NOT the Next.js you know** — read `node_modules/next/dist/docs/` before using any unfamiliar API; heed deprecation notices (`AGENTS.md`).
- **Admin gating funnels through `lib/auth/admin-access.ts`** — `isAdmin(user)` / `isCurrentUserAdmin()`. Owner = `OWNER_NOTIFY_EMAIL` env (never locked out) OR a row in `admins`. Admins bypass every feature gate.
- **Default-deny tables, service-role only.** `feature_access` / `feature_allowlist` get RLS enabled with **no policies** — same as `admins`. Never add an anon/auth read or write policy. All access via `createAdminSupabaseClient()`.
- **Dictionary parity is enforced by a vitest test** — every key added to `app/[lang]/dictionaries/en.json` MUST exist with identical shape in `he.json` (and vice-versa). Hebrew is the primary language.
- **Logical CSS only** (`ms-/me-/ps-/pe-/text-start/text-end`); wrap emails/ids in `dir="ltr"`. Components are kebab-case files with named exports; copy comes from the dictionaries, never hard-coded.
- **Commits:** this machine has a broken global gitconfig — prefix every git command with `GIT_CONFIG_GLOBAL=/dev/null`. End commit messages with `Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>`.
- **DB migrations are Supabase CLI** (`npm run db:new` / `npm run db:push`), not Vercel. Money/agorot, snapshots, RLS for orders/products are untouched by this work.

## File Structure

**Create:**
- `supabase/migrations/<ts>_feature_access.sql` — `feature_access` + `feature_allowlist` tables, RLS default-deny, seed.
- `lib/auth/feature-access.ts` — `FEATURES` registry, types, pure `evaluateFeatureAccess`, IO wrappers.
- `lib/auth/feature-access.test.ts` — unit test for the pure core.
- `lib/auth/find-user.ts` — `findUserByEmail` (extracted from `admins.ts`).
- `app/actions/feature-access.ts` — admin-gated management actions.
- `app/[lang]/admin/access/page.tsx` — the Feature access admin page.
- `components/admin/feature-access-manager.tsx` — the management UI.

**Modify:**
- `app/actions/admins.ts` — use shared `findUserByEmail`.
- `components/admin/admin-nav.tsx` — add the `access` nav item + widen `current`.
- `app/[lang]/dictionaries/he.json`, `en.json` — `admin.access` slice + `admin.nav.access`.
- `app/[lang]/stickers/page.tsx`, `app/[lang]/stickers/checkout/page.tsx`, `app/actions/stickers.ts` — env gate → feature gate.
- `app/[lang]/store/page.tsx`, `store/[slug]/page.tsx`, `store/cart/page.tsx`, `store/checkout/page.tsx`, `app/actions/store.ts` — add the store gate.
- `app/[lang]/layout.tsx`, `components/layout/header.tsx` — compute + apply `canSeeStore` / `canSeeStickers`.
- `.env.example`, `docs/sticker-shop-setup.md`, `supabase/migrations/README.md`, `.claude/skills/sticker-shop/SKILL.md`, `.claude/skills/linecut-website/SKILL.md` — drop env vars, document DB system.

**Delete:**
- `lib/auth/sticker-access.ts`, `lib/auth/sticker-access.test.ts`.

---

### Task 1: Migration — feature_access + feature_allowlist tables

**Files:**
- Create: `supabase/migrations/<ts>_feature_access.sql`
- Modify: `supabase/migrations/README.md`

**Interfaces:**
- Produces: tables `feature_access(feature text pk, visibility text, updated_at)`, `feature_allowlist(feature, user_id, email, granted_by, created_at, pk(feature,user_id))`. Seed rows: `feature_access` = `('stickers','restricted')`,`('store','public')`; `feature_allowlist` seeded from existing accounts matching the two default sticker emails.

- [ ] **Step 1: Generate the migration file**

Run: `npm run db:new feature_access`
Expected: prints a new path like `supabase/migrations/<UTCtimestamp>_feature_access.sql` (empty file). Use that exact path for the next step.

- [ ] **Step 2: Write the migration SQL**

Paste into the generated file (reuses the `set_updated_at()` trigger function created in `20260620181548_orders.sql`):

```sql
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
```

- [ ] **Step 3: Apply the migration**

Run: `npm run db:push`
Expected: applies cleanly; `feature_access` and `feature_allowlist` reported as new. (A harmless post-apply "pgdelta cert" SSL warning may appear in this sandbox — ignore it; re-run `npm run db:push` and confirm "Remote database is up to date".)

- [ ] **Step 4: Verify RLS default-deny + seed**

Run (psql against the project, or the Supabase SQL editor):
```sql
select feature, visibility from feature_access order by feature;
select count(*) from pg_policies where tablename in ('feature_access','feature_allowlist');
select relrowsecurity from pg_class where relname in ('feature_access','feature_allowlist');
```
Expected: two rows (`stickers|restricted`, `store|public`); policy count `0`; `relrowsecurity` = `t` for both.

- [ ] **Step 5: Document the tables in the migrations README**

In `supabase/migrations/README.md`, in the migration-list section (near the `<ts>_admins.sql` bullet), add:
```markdown
- `<ts>_feature_access.sql` — `feature_access` + `feature_allowlist` tables
  (DB-managed, admin-controlled access to the sticker shop + store; replaces the
  `STICKER_SHOP_*` env vars). RLS default-deny, no policies — service-role only.
```

- [ ] **Step 6: Commit**

```bash
GIT_CONFIG_GLOBAL=/dev/null git add supabase/migrations supabase/migrations/README.md
GIT_CONFIG_GLOBAL=/dev/null git commit -m "feat(db): feature_access + feature_allowlist tables

DB-backed, admin-managed access for the sticker shop + store. Default-deny RLS,
service-role only. Seeds stickers=restricted/store=public and the prior default
sticker emails (for existing accounts).

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 2: Feature registry + pure `evaluateFeatureAccess` core (TDD)

**Files:**
- Create: `lib/auth/feature-access.ts` (registry + types + pure core only — IO wrappers come in Task 3)
- Test: `lib/auth/feature-access.test.ts`

**Interfaces:**
- Produces:
  - `FEATURES` — `readonly [{ key:"stickers", defaultVisibility:"restricted" }, { key:"store", defaultVisibility:"public" }]`
  - `type FeatureKey = "stickers" | "store"`, `type FeatureVisibility = "public" | "restricted"`
  - `isFeatureKey(value: string): value is FeatureKey`
  - `featureDefaultVisibility(feature: FeatureKey): FeatureVisibility`
  - `evaluateFeatureAccess(input: { isAdmin: boolean; visibility: FeatureVisibility; userId: string | null; allowedUserIds: ReadonlySet<string> }): boolean`

- [ ] **Step 1: Write the failing test**

Create `lib/auth/feature-access.test.ts`:
```ts
import { describe, it, expect } from "vitest";
import {
  FEATURES,
  isFeatureKey,
  featureDefaultVisibility,
  evaluateFeatureAccess,
} from "./feature-access";

describe("FEATURES registry", () => {
  it("lists stickers (restricted) and store (public) as defaults", () => {
    expect(FEATURES.map((f) => f.key)).toEqual(["stickers", "store"]);
    expect(featureDefaultVisibility("stickers")).toBe("restricted");
    expect(featureDefaultVisibility("store")).toBe("public");
  });

  it("isFeatureKey accepts known keys and rejects others", () => {
    expect(isFeatureKey("stickers")).toBe(true);
    expect(isFeatureKey("store")).toBe(true);
    expect(isFeatureKey("orders")).toBe(false);
    expect(isFeatureKey("")).toBe(false);
  });
});

describe("evaluateFeatureAccess", () => {
  const NONE: ReadonlySet<string> = new Set();

  it("admins always pass, even when restricted and not allow-listed", () => {
    expect(
      evaluateFeatureAccess({ isAdmin: true, visibility: "restricted", userId: "u1", allowedUserIds: NONE }),
    ).toBe(true);
  });

  it("public features allow everyone, including guests", () => {
    expect(
      evaluateFeatureAccess({ isAdmin: false, visibility: "public", userId: null, allowedUserIds: NONE }),
    ).toBe(true);
  });

  it("restricted: a guest (no userId) is denied", () => {
    expect(
      evaluateFeatureAccess({ isAdmin: false, visibility: "restricted", userId: null, allowedUserIds: new Set(["u1"]) }),
    ).toBe(false);
  });

  it("restricted: an allow-listed user passes, a non-listed user is denied", () => {
    const allow = new Set(["u1", "u2"]);
    expect(
      evaluateFeatureAccess({ isAdmin: false, visibility: "restricted", userId: "u1", allowedUserIds: allow }),
    ).toBe(true);
    expect(
      evaluateFeatureAccess({ isAdmin: false, visibility: "restricted", userId: "u3", allowedUserIds: allow }),
    ).toBe(false);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run test -- feature-access`
Expected: FAIL — `Cannot find module './feature-access'` (or "is not a function").

- [ ] **Step 3: Write the registry + pure core**

Create `lib/auth/feature-access.ts` (pure portion only — no IO/imports yet):
```ts
/**
 * Feature-access core: which gated features exist, their fallback default
 * visibility, and the pure access rule. The IO wrappers (DB reads + admin
 * bypass) are added below in Task 3 — this top section stays pure & testable.
 */

export const FEATURES = [
  { key: "stickers", defaultVisibility: "restricted" },
  { key: "store", defaultVisibility: "public" },
] as const;

export type FeatureKey = (typeof FEATURES)[number]["key"];
export type FeatureVisibility = "public" | "restricted";

/** Narrowing guard for untrusted input (server actions, route params). */
export function isFeatureKey(value: string): value is FeatureKey {
  return FEATURES.some((f) => f.key === value);
}

/** The code-side fallback visibility when no `feature_access` row exists yet. */
export function featureDefaultVisibility(feature: FeatureKey): FeatureVisibility {
  const found = FEATURES.find((f) => f.key === feature);
  return (found?.defaultVisibility ?? "restricted") as FeatureVisibility;
}

/**
 * Pure access rule. Admins bypass everything; public ⇒ everyone; restricted ⇒
 * the user must be signed in AND on the allow-list.
 */
export function evaluateFeatureAccess(input: {
  isAdmin: boolean;
  visibility: FeatureVisibility;
  userId: string | null;
  allowedUserIds: ReadonlySet<string>;
}): boolean {
  if (input.isAdmin) return true;
  if (input.visibility === "public") return true;
  if (!input.userId) return false;
  return input.allowedUserIds.has(input.userId);
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm run test -- feature-access`
Expected: PASS (all cases green).

- [ ] **Step 5: Commit**

```bash
GIT_CONFIG_GLOBAL=/dev/null git add lib/auth/feature-access.ts lib/auth/feature-access.test.ts
GIT_CONFIG_GLOBAL=/dev/null git commit -m "feat(auth): feature registry + pure evaluateFeatureAccess core

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 3: IO wrappers — visibility, allow-list, current-user gate

**Files:**
- Modify: `lib/auth/feature-access.ts` (append the IO wrappers)

**Interfaces:**
- Consumes: `isAdmin` from `lib/auth/admin-access.ts`; `createAdminSupabaseClient` from `lib/supabase/admin.ts`; `createServerSupabaseClient` from `lib/supabase/server.ts`; the pure core from Task 2.
- Produces:
  - `getFeatureVisibility(feature: FeatureKey): Promise<FeatureVisibility>`
  - `isFeatureAllowed(feature: FeatureKey, user: { id: string; email?: string | null } | null): Promise<boolean>`
  - `getCurrentUserFeatureAccess(feature: FeatureKey): Promise<{ allowed: boolean; user: { id: string; email?: string | null } | null }>`

- [ ] **Step 1: Add the `server-only` import and IO imports at the top of the file**

At the very top of `lib/auth/feature-access.ts` (above the existing block comment), add:
```ts
import "server-only";

import { createAdminSupabaseClient } from "@/lib/supabase/admin";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { isAdmin } from "@/lib/auth/admin-access";
```

- [ ] **Step 2: Append the IO wrappers at the end of the file**

```ts
/** Read a feature's visibility from the DB, falling back to the registry default. */
export async function getFeatureVisibility(
  feature: FeatureKey,
): Promise<FeatureVisibility> {
  const admin = createAdminSupabaseClient();
  const { data } = await admin
    .from("feature_access")
    .select("visibility")
    .eq("feature", feature)
    .maybeSingle();
  const visibility = (data as { visibility?: string } | null)?.visibility;
  return visibility === "public" || visibility === "restricted"
    ? visibility
    : featureDefaultVisibility(feature);
}

/**
 * Is this user allowed to use the feature? Admins bypass; public ⇒ yes;
 * restricted ⇒ the user must be signed in and on the allow-list. Skips the
 * allow-list query when the user is an admin or the feature is public.
 */
export async function isFeatureAllowed(
  feature: FeatureKey,
  user: { id: string; email?: string | null } | null,
): Promise<boolean> {
  if (await isAdmin(user)) return true;

  const visibility = await getFeatureVisibility(feature);
  if (visibility === "public") return true;
  if (!user) return false;

  const admin = createAdminSupabaseClient();
  const { data } = await admin
    .from("feature_allowlist")
    .select("user_id")
    .eq("feature", feature)
    .eq("user_id", user.id)
    .maybeSingle();

  return evaluateFeatureAccess({
    isAdmin: false,
    visibility,
    userId: user.id,
    allowedUserIds: new Set(data ? [user.id] : []),
  });
}

/**
 * Fetch the current session and evaluate access in one call. Mirrors the old
 * checkStickerAccess() shape — used by the gated server actions.
 */
export async function getCurrentUserFeatureAccess(feature: FeatureKey): Promise<{
  allowed: boolean;
  user: { id: string; email?: string | null } | null;
}> {
  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const slim = user ? { id: user.id, email: user.email } : null;
  return { allowed: await isFeatureAllowed(feature, slim), user: slim };
}
```

- [ ] **Step 3: Typecheck**

Run: `npm run typecheck`
Expected: PASS (no errors). The pure-core test still passes (`npm run test -- feature-access`).

- [ ] **Step 4: Commit**

```bash
GIT_CONFIG_GLOBAL=/dev/null git add lib/auth/feature-access.ts
GIT_CONFIG_GLOBAL=/dev/null git commit -m "feat(auth): DB-backed feature-access IO wrappers

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 4: Extract `findUserByEmail` into a shared module

**Files:**
- Create: `lib/auth/find-user.ts`
- Modify: `app/actions/admins.ts`

**Interfaces:**
- Produces: `findUserByEmail(admin: SupabaseClient, email: string): Promise<{ id: string; email?: string } | null>` (paginates `auth.admin.listUsers`, case-insensitive match).
- Consumes (in `admins.ts`): replaces the local private `findUserByEmail`.

- [ ] **Step 1: Create the shared module**

Create `lib/auth/find-user.ts`:
```ts
import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Find an auth user by email (case-insensitive). Paginates the admin API.
 * Returns null if not found. Requires a service-role (admin) client.
 */
export async function findUserByEmail(
  admin: SupabaseClient,
  email: string,
): Promise<{ id: string; email?: string } | null> {
  const normalized = email.trim().toLowerCase();
  const perPage = 200;
  for (let page = 1; page <= 50; page++) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage });
    if (error || !data) return null;
    const match = data.users.find((u) => u.email?.toLowerCase() === normalized);
    if (match) return { id: match.id, email: match.email ?? undefined };
    if (data.users.length < perPage) return null; // last page
  }
  return null;
}
```

- [ ] **Step 2: Use it in `admins.ts`**

In `app/actions/admins.ts`: delete the local `findUserByEmail` function (lines 16-30 — the whole `/** Find an auth user… */` block) and add this import near the other imports at the top:
```ts
import { findUserByEmail } from "@/lib/auth/find-user";
```
Leave the call site in `grantAdmin` as-is (`await findUserByEmail(admin, normalized)`).

- [ ] **Step 3: Typecheck**

Run: `npm run typecheck`
Expected: PASS — `admins.ts` now imports the shared helper; no unused-symbol errors.

- [ ] **Step 4: Commit**

```bash
GIT_CONFIG_GLOBAL=/dev/null git add lib/auth/find-user.ts app/actions/admins.ts
GIT_CONFIG_GLOBAL=/dev/null git commit -m "refactor(auth): extract findUserByEmail into lib/auth/find-user

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 5: Management server actions

**Files:**
- Create: `app/actions/feature-access.ts`

**Interfaces:**
- Consumes: `isCurrentUserAdmin` (`lib/auth/admin-access.ts`), `FEATURES`/`FeatureKey`/`FeatureVisibility`/`isFeatureKey`/`getFeatureVisibility` (`lib/auth/feature-access.ts`), `findUserByEmail` (`lib/auth/find-user.ts`), `createAdminSupabaseClient`, `createServerSupabaseClient`.
- Produces:
  - `type AllowedUser = { userId: string; email: string; createdAtISO: string }`
  - `type FeatureAccessView = { feature: FeatureKey; visibility: FeatureVisibility; allowed: AllowedUser[] }`
  - `listFeatureAccess(): Promise<FeatureAccessView[]>`
  - `setFeatureVisibility(feature: string, visibility: string): Promise<{ ok: boolean; message?: string }>`
  - `addFeatureAllowedUser(feature: string, email: string): Promise<{ ok: boolean; message?: string }>`
  - `removeFeatureAllowedUser(feature: string, userId: string): Promise<{ ok: boolean; message?: string }>`

- [ ] **Step 1: Write the actions module**

Create `app/actions/feature-access.ts`:
```ts
"use server";

import { createAdminSupabaseClient } from "@/lib/supabase/admin";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { isCurrentUserAdmin } from "@/lib/auth/admin-access";
import { findUserByEmail } from "@/lib/auth/find-user";
import {
  FEATURES,
  isFeatureKey,
  getFeatureVisibility,
  type FeatureKey,
  type FeatureVisibility,
} from "@/lib/auth/feature-access";

export type AllowedUser = {
  userId: string;
  email: string;
  createdAtISO: string;
};

export type FeatureAccessView = {
  feature: FeatureKey;
  visibility: FeatureVisibility;
  allowed: AllowedUser[];
};

type MutationResult = { ok: boolean; message?: string };

/** Every feature with its current visibility + allow-list. Admin-gated. */
export async function listFeatureAccess(): Promise<FeatureAccessView[]> {
  if (!(await isCurrentUserAdmin())) return [];
  const admin = createAdminSupabaseClient();

  const { data: rows } = await admin
    .from("feature_allowlist")
    .select("feature, user_id, email, created_at")
    .order("created_at", { ascending: true });

  const allowByFeature = new Map<string, AllowedUser[]>();
  for (const r of (rows ?? []) as {
    feature: string;
    user_id: string;
    email: string;
    created_at: string;
  }[]) {
    const list = allowByFeature.get(r.feature) ?? [];
    list.push({ userId: r.user_id, email: r.email, createdAtISO: r.created_at });
    allowByFeature.set(r.feature, list);
  }

  const views: FeatureAccessView[] = [];
  for (const f of FEATURES) {
    views.push({
      feature: f.key,
      visibility: await getFeatureVisibility(f.key),
      allowed: allowByFeature.get(f.key) ?? [],
    });
  }
  return views;
}

export async function setFeatureVisibility(
  feature: string,
  visibility: string,
): Promise<MutationResult> {
  if (!(await isCurrentUserAdmin())) return { ok: false, message: "forbidden" };
  if (!isFeatureKey(feature)) return { ok: false, message: "invalid_feature" };
  if (visibility !== "public" && visibility !== "restricted") {
    return { ok: false, message: "invalid_visibility" };
  }

  const admin = createAdminSupabaseClient();
  const { error } = await admin
    .from("feature_access")
    .upsert({ feature, visibility }, { onConflict: "feature" });
  if (error) return { ok: false, message: "db_error" };
  return { ok: true };
}

export async function addFeatureAllowedUser(
  feature: string,
  email: string,
): Promise<MutationResult> {
  if (!(await isCurrentUserAdmin())) return { ok: false, message: "forbidden" };
  if (!isFeatureKey(feature)) return { ok: false, message: "invalid_feature" };

  const normalized = email.trim().toLowerCase();
  if (!normalized || !normalized.includes("@")) {
    return { ok: false, message: "invalid_email" };
  }

  const admin = createAdminSupabaseClient();
  const target = await findUserByEmail(admin, normalized);
  if (!target) return { ok: false, message: "user_not_found" };

  const supabase = await createServerSupabaseClient();
  const {
    data: { user: grantor },
  } = await supabase.auth.getUser();

  const { error } = await admin.from("feature_allowlist").upsert(
    {
      feature,
      user_id: target.id,
      email: target.email ?? normalized,
      granted_by: grantor?.id ?? null,
    },
    { onConflict: "feature,user_id" },
  );
  if (error) return { ok: false, message: "db_error" };
  return { ok: true };
}

export async function removeFeatureAllowedUser(
  feature: string,
  userId: string,
): Promise<MutationResult> {
  if (!(await isCurrentUserAdmin())) return { ok: false, message: "forbidden" };
  if (!isFeatureKey(feature)) return { ok: false, message: "invalid_feature" };

  const admin = createAdminSupabaseClient();
  const { error } = await admin
    .from("feature_allowlist")
    .delete()
    .eq("feature", feature)
    .eq("user_id", userId);
  if (error) return { ok: false, message: "db_error" };
  return { ok: true };
}
```

- [ ] **Step 2: Typecheck**

Run: `npm run typecheck`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
GIT_CONFIG_GLOBAL=/dev/null git add app/actions/feature-access.ts
GIT_CONFIG_GLOBAL=/dev/null git commit -m "feat(admin): feature-access management server actions

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 6: i18n — `admin.access` slice + `admin.nav.access`

**Files:**
- Modify: `app/[lang]/dictionaries/en.json`, `app/[lang]/dictionaries/he.json`

**Interfaces:**
- Produces: `Dictionary["admin"]["nav"]["access"]` and `Dictionary["admin"]["access"]` (heading, description, `features.{store,stickers}`, `visibility.{public,restricted}`, `publicNote`, `restrictedNote`, allow-list editor labels, `errors.{user_not_found,invalid_email,serverError}`). Both files must stay identical in shape.

- [ ] **Step 1: Add `access` to the admin nav block in BOTH files**

In `en.json`, in `admin.nav`, after `"admins"` add `"access": "Feature access"`. In `he.json`, in `admin.nav`, after `"admins"` add `"access": "גישה לפיצ׳רים"`.

- [ ] **Step 2: Add the `admin.access` slice to `en.json`**

In `en.json`, inside `admin` (e.g. right after the `admins` slice), add:
```json
"access": {
  "heading": "Feature access",
  "description": "Choose whether each feature is open to everyone or limited to specific signed-in users.",
  "features": {
    "store": "Store",
    "stickers": "Sticker shop"
  },
  "visibility": {
    "public": "Public",
    "restricted": "Restricted"
  },
  "publicNote": "Anyone can use this feature.",
  "restrictedNote": "Only the users below (and admins) can use this feature.",
  "addByEmail": "Allow a user by email",
  "emailPlaceholder": "name@example.com",
  "add": "Allow",
  "adding": "Adding…",
  "remove": "Remove",
  "removeConfirm": "Remove this user's access?",
  "empty": "No users allowed yet — add one above.",
  "addedOn": "Added {date}",
  "errors": {
    "user_not_found": "No user found with that email — they must sign up first.",
    "invalid_email": "Invalid email",
    "invalid_feature": "Unknown feature",
    "invalid_visibility": "Invalid visibility",
    "serverError": "Something went wrong. Please try again."
  }
}
```

- [ ] **Step 3: Add the matching `admin.access` slice to `he.json`**

In `he.json`, inside `admin` (same position), add:
```json
"access": {
  "heading": "גישה לפיצ׳רים",
  "description": "בחרו אם כל פיצ׳ר פתוח לכולם או מוגבל למשתמשים מחוברים מסוימים.",
  "features": {
    "store": "חנות",
    "stickers": "חנות מדבקות"
  },
  "visibility": {
    "public": "ציבורי",
    "restricted": "מוגבל"
  },
  "publicNote": "כל אחד יכול להשתמש בפיצ׳ר הזה.",
  "restrictedNote": "רק המשתמשים שלמטה (ומנהלים) יכולים להשתמש בפיצ׳ר הזה.",
  "addByEmail": "הוספת משתמש מורשה לפי אימייל",
  "emailPlaceholder": "name@example.com",
  "add": "הוספה",
  "adding": "מוסיף…",
  "remove": "הסרה",
  "removeConfirm": "להסיר את הגישה של המשתמש הזה?",
  "empty": "אין עדיין משתמשים מורשים — הוסיפו אחד למעלה.",
  "addedOn": "נוסף בתאריך {date}",
  "errors": {
    "user_not_found": "לא נמצא משתמש עם אימייל זה — עליו להירשם תחילה.",
    "invalid_email": "אימייל לא תקין",
    "invalid_feature": "פיצ׳ר לא מוכר",
    "invalid_visibility": "ערך תצוגה לא תקין",
    "serverError": "משהו השתבש. נסו שוב."
  }
}
```

- [ ] **Step 4: Run the dictionary parity test**

Run: `npm run test -- dictionaries`
Expected: PASS — he/en have identical shape (the parity test for the dictionaries stays green).

- [ ] **Step 5: Commit**

```bash
GIT_CONFIG_GLOBAL=/dev/null git add "app/[lang]/dictionaries/en.json" "app/[lang]/dictionaries/he.json"
GIT_CONFIG_GLOBAL=/dev/null git commit -m "i18n: add admin.access + admin.nav.access (he/en)

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 7: Admin UI — Feature access page, manager component, nav item

**Files:**
- Modify: `components/admin/admin-nav.tsx`
- Create: `components/admin/feature-access-manager.tsx`
- Create: `app/[lang]/admin/access/page.tsx`

**Interfaces:**
- Consumes: `listFeatureAccess`/`setFeatureVisibility`/`addFeatureAllowedUser`/`removeFeatureAllowedUser`/`FeatureAccessView` (Task 5); `Dictionary["admin"]["access"]` + `admin.nav` (Task 6); `isAdmin` gate pattern.
- Produces: route `/[lang]/admin/access`; `AdminNav` accepts `current="access"`.

- [ ] **Step 1: Add the `access` item to `admin-nav.tsx`**

In `components/admin/admin-nav.tsx`, widen the `current` union and append the link. Replace the `current` prop type:
```ts
  current: "products" | "orders" | "admins" | "access";
```
and add to the `links` array (after the `admins` entry):
```ts
    { key: "access", href: `/${lang}/admin/access`, label: dict.access },
```

- [ ] **Step 2: Create the manager component**

Create `components/admin/feature-access-manager.tsx` (mirrors `admins-manager.tsx`):
```tsx
"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  setFeatureVisibility,
  addFeatureAllowedUser,
  removeFeatureAllowedUser,
  type FeatureAccessView,
} from "@/app/actions/feature-access";
import { interpolate } from "@/lib/stickers/format";
import type { Dictionary } from "@/lib/dictionary";
import type { Locale } from "@/lib/i18n";

export function FeatureAccessManager({
  features,
  dict,
  lang,
}: {
  features: FeatureAccessView[];
  dict: Dictionary["admin"]["access"];
  lang: Locale;
}) {
  return (
    <div className="flex flex-col gap-8">
      <p className="text-sm text-muted">{dict.description}</p>
      {features.map((f) => (
        <FeatureCard key={f.feature} feature={f} dict={dict} lang={lang} />
      ))}
    </div>
  );
}

function FeatureCard({
  feature,
  dict,
  lang,
}: {
  feature: FeatureAccessView;
  dict: Dictionary["admin"]["access"];
  lang: Locale;
}) {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const bcp47 = lang === "he" ? "he-IL" : "en-IL";
  const restricted = feature.visibility === "restricted";

  function showError(code?: string) {
    setError(dict.errors[code as keyof typeof dict.errors] ?? dict.errors.serverError);
  }

  function handleSetVisibility(visibility: "public" | "restricted") {
    if (isPending || visibility === feature.visibility) return;
    setError(null);
    startTransition(async () => {
      const res = await setFeatureVisibility(feature.feature, visibility);
      if (res.ok) router.refresh();
      else showError(res.message);
    });
  }

  function handleAdd(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (isPending || !email.trim()) return;
    setError(null);
    startTransition(async () => {
      const res = await addFeatureAllowedUser(feature.feature, email.trim());
      if (res.ok) {
        setEmail("");
        router.refresh();
      } else {
        showError(res.message);
      }
    });
  }

  function handleRemove(userId: string) {
    if (isPending) return;
    if (!window.confirm(dict.removeConfirm)) return;
    setError(null);
    startTransition(async () => {
      const res = await removeFeatureAllowedUser(feature.feature, userId);
      if (res.ok) router.refresh();
      else showError(res.message);
    });
  }

  return (
    <section className="flex flex-col gap-4 rounded-lg border border-line p-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="font-display text-lg font-bold text-ink">
          {dict.features[feature.feature]}
        </h2>
        <div className="inline-flex overflow-hidden rounded-md border border-line" role="group">
          {(["public", "restricted"] as const).map((v) => (
            <button
              key={v}
              type="button"
              onClick={() => handleSetVisibility(v)}
              disabled={isPending}
              aria-pressed={feature.visibility === v}
              className={`px-3 py-1.5 text-sm font-medium transition-colors disabled:opacity-50 ${
                feature.visibility === v ? "bg-ink text-paper" : "text-ink hover:bg-paper-2"
              }`}
            >
              {dict.visibility[v]}
            </button>
          ))}
        </div>
      </div>

      {!restricted ? (
        <p className="text-sm text-muted">{dict.publicNote}</p>
      ) : (
        <div className="flex flex-col gap-4">
          <p className="text-sm text-muted">{dict.restrictedNote}</p>

          <form onSubmit={handleAdd} className="flex flex-col gap-2 sm:flex-row sm:items-end">
            <div className="flex flex-1 flex-col gap-1">
              <label htmlFor={`allow-${feature.feature}`} className="text-sm font-medium text-ink">
                {dict.addByEmail}
              </label>
              <input
                id={`allow-${feature.feature}`}
                type="email"
                dir="ltr"
                autoComplete="off"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder={dict.emailPlaceholder}
                className="h-11 rounded-md border border-line bg-paper px-3 outline-none focus:border-accent"
              />
            </div>
            <Button type="submit" variant="primary" disabled={isPending} className="min-h-[44px]">
              {isPending ? dict.adding : dict.add}
            </Button>
          </form>

          {feature.allowed.length === 0 ? (
            <p className="text-muted">{dict.empty}</p>
          ) : (
            <ul className="divide-y divide-line rounded-lg border border-line">
              {feature.allowed.map((u) => (
                <li key={u.userId} className="flex items-center justify-between gap-4 p-4">
                  <div className="min-w-0">
                    <p dir="ltr" className="truncate font-medium text-ink">
                      {u.email}
                    </p>
                    <p className="text-xs text-muted">
                      {interpolate(dict.addedOn, {
                        date: new Intl.DateTimeFormat(bcp47).format(new Date(u.createdAtISO)),
                      })}
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => handleRemove(u.userId)}
                    disabled={isPending}
                    className="shrink-0 text-muted hover:text-accent disabled:opacity-50"
                    aria-label={dict.remove}
                  >
                    <Trash2 className="size-4" aria-hidden="true" />
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      {error && (
        <p role="alert" className="text-sm text-accent">
          {error}
        </p>
      )}
    </section>
  );
}
```

- [ ] **Step 3: Create the page**

Create `app/[lang]/admin/access/page.tsx` (mirrors `admin/admins/page.tsx`):
```tsx
import { notFound, redirect } from "next/navigation";
import { Container } from "@/components/layout/container";
import { isLocale } from "@/lib/i18n";
import { getDictionary } from "../../dictionaries";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { isAdmin } from "@/lib/auth/admin-access";
import { listFeatureAccess } from "@/app/actions/feature-access";
import { AdminNav } from "@/components/admin/admin-nav";
import { FeatureAccessManager } from "@/components/admin/feature-access-manager";

export const dynamic = "force-dynamic";

export default async function AdminAccessPage({
  params,
}: {
  params: Promise<{ lang: string }>;
}) {
  const { lang } = await params;
  if (!isLocale(lang)) notFound();

  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!(await isAdmin(user ? { id: user.id, email: user.email } : null))) {
    redirect(`/${lang}/login`);
  }

  const dict = await getDictionary(lang);
  const features = await listFeatureAccess();

  return (
    <Container>
      <div className="flex flex-col gap-6 py-10">
        <AdminNav lang={lang} dict={dict.admin.nav} current="access" />
        <h1 className="font-display text-2xl font-bold text-ink">
          {dict.admin.access.heading}
        </h1>
        <FeatureAccessManager features={features} dict={dict.admin.access} lang={lang} />
      </div>
    </Container>
  );
}
```

- [ ] **Step 4: Typecheck + build**

Run: `npm run typecheck && npm run build`
Expected: PASS — the new route compiles; `dict.admin.access` / `dict.admin.nav.access` resolve against the Dictionary type (proof Task 6's keys are wired).

- [ ] **Step 5: Commit**

```bash
GIT_CONFIG_GLOBAL=/dev/null git add components/admin/admin-nav.tsx components/admin/feature-access-manager.tsx "app/[lang]/admin/access/page.tsx"
GIT_CONFIG_GLOBAL=/dev/null git commit -m "feat(admin): Feature access page + manager UI

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 8: Refactor the sticker gate to feature-access; delete `sticker-access.ts`

**Files:**
- Modify: `app/[lang]/stickers/page.tsx`, `app/[lang]/stickers/checkout/page.tsx`, `app/actions/stickers.ts`
- Delete: `lib/auth/sticker-access.ts`, `lib/auth/sticker-access.test.ts`

**Interfaces:**
- Consumes: `isFeatureAllowed`, `getCurrentUserFeatureAccess` (Task 3).
- Produces: stickers gated by `'stickers'` feature access; no remaining references to `sticker-access`.

- [ ] **Step 1: Update `app/[lang]/stickers/page.tsx`**

Replace the import:
```ts
import { isStickerShopUser, isStickerShopRestricted } from "@/lib/auth/sticker-access";
```
with:
```ts
import { isFeatureAllowed } from "@/lib/auth/feature-access";
```
Replace the gate block (the `if (isStickerShopRestricted() && !isStickerShopUser(user?.email)) { … }`) with:
```ts
  // Gated by the 'stickers' feature: public ⇒ everyone; restricted ⇒ allow-listed
  // signed-in users (admins always pass). Guests → login, others → home.
  const allowed = await isFeatureAllowed(
    "stickers",
    user ? { id: user.id, email: user.email } : null,
  );
  if (!allowed) {
    redirect(user ? `/${lang}` : `/${lang}/login`);
  }
```

- [ ] **Step 2: Update `app/[lang]/stickers/checkout/page.tsx`**

Apply the identical import swap and gate-block replacement as Step 1 (same `isFeatureAllowed("stickers", …)` + redirect). (It already fetches `user`; keep that.)

- [ ] **Step 3: Update `app/actions/stickers.ts`**

Replace the import block:
```ts
import {
  isStickerShopUser,
  isStickerShopRestricted,
} from "@/lib/auth/sticker-access";
```
with:
```ts
import { getCurrentUserFeatureAccess } from "@/lib/auth/feature-access";
```
Replace the whole `checkStickerAccess` helper (the `/** Access check … */` block + function) with:
```ts
/**
 * Access check for the sticker order actions (create/confirm). Defense in depth
 * — the pages redirect too, but actions are callable directly. Gated by the
 * 'stickers' feature (public ⇒ everyone, incl. guests; restricted ⇒ allow-listed
 * signed-in users; admins always pass).
 */
async function checkStickerAccess(): Promise<{
  allowed: boolean;
  user: { id: string; email?: string } | null;
}> {
  return getCurrentUserFeatureAccess("stickers");
}
```
(Both call sites — `createOrderDraft` and `confirmOrder` — keep using `checkStickerAccess()` unchanged.)

- [ ] **Step 4: Delete the obsolete module + its test**

```bash
GIT_CONFIG_GLOBAL=/dev/null git rm lib/auth/sticker-access.ts lib/auth/sticker-access.test.ts
```

- [ ] **Step 5: Verify no stragglers + typecheck + test**

Run:
```bash
grep -rn "sticker-access\|isStickerShop\|STICKER_SHOP_PUBLIC\|STICKER_SHOP_ALLOWED" app lib components --include="*.ts*"
npm run typecheck && npm run test
```
Expected: the grep prints **nothing** (no code references remain); typecheck PASS; full test suite PASS (the deleted test is gone, parity + feature-access core green).

- [ ] **Step 6: Commit**

```bash
GIT_CONFIG_GLOBAL=/dev/null git add -A
GIT_CONFIG_GLOBAL=/dev/null git commit -m "refactor(stickers): gate via DB feature-access; remove env allow-list

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 9: Gate the store (pages + actions)

**Files:**
- Modify: `app/[lang]/store/page.tsx`, `store/[slug]/page.tsx`, `store/cart/page.tsx`, `store/checkout/page.tsx`, `app/actions/store.ts`

**Interfaces:**
- Consumes: `isFeatureAllowed`, `getCurrentUserFeatureAccess` (Task 3).
- Produces: every store browse/cart/checkout surface + both store actions gated by `'store'`. The `store/track/[token]` route is intentionally NOT modified.

- [ ] **Step 1: Add a gate helper snippet to each of the 4 store pages**

In each of `app/[lang]/store/page.tsx`, `store/[slug]/page.tsx`, `store/cart/page.tsx`, `store/checkout/page.tsx`, add these imports (next to the existing ones):
```ts
import { redirect } from "next/navigation";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { isFeatureAllowed } from "@/lib/auth/feature-access";
```
(`page.tsx` and `[slug]/page.tsx` already import `notFound` from `next/navigation` — merge `redirect` into that existing import rather than duplicating it.)

Then, immediately after the `if (!isLocale(lang)) notFound();` line in each page's default export, insert:
```ts
  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!(await isFeatureAllowed("store", user ? { id: user.id, email: user.email } : null))) {
    redirect(user ? `/${lang}` : `/${lang}/login`);
  }
```
(`store/cart/page.tsx` is not currently `force-dynamic`; reading auth cookies makes it dynamic automatically — no extra export needed.)

- [ ] **Step 2: Gate the store actions in `app/actions/store.ts`**

Add the import:
```ts
import { getCurrentUserFeatureAccess } from "@/lib/auth/feature-access";
```
At the top of `quoteStoreCart` (before the `return quoteCart(...)`):
```ts
  const { allowed } = await getCurrentUserFeatureAccess("store");
  if (!allowed) return { ok: false, message: "forbidden" };
```
At the top of `confirmStoreOrder` (before assembling deps / after reading nothing else — it currently fetches the user first; put the gate first):
```ts
  const access = await getCurrentUserFeatureAccess("store");
  if (!access.allowed) return { ok: false, message: "forbidden" };
```
Then reuse `access.user` for the existing `user_id` wiring instead of re-fetching: replace the existing `const supabase = await createServerSupabaseClient(); const { data: { user } } = await supabase.auth.getUser();` block in `confirmStoreOrder` with `const user = access.user;`. (Both `QuoteCartResult` and `ConfirmStoreOrderResult` already include the `{ ok:false; message:string }` variant, so these returns typecheck.)

- [ ] **Step 3: Typecheck + build**

Run: `npm run typecheck && npm run build`
Expected: PASS — all four store pages + both actions compile.

- [ ] **Step 4: Commit**

```bash
GIT_CONFIG_GLOBAL=/dev/null git add "app/[lang]/store" app/actions/store.ts
GIT_CONFIG_GLOBAL=/dev/null git commit -m "feat(store): gate browse/cart/checkout + actions via feature-access

Track pages stay open (token-gated).

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 10: Header nav reflects access (`canSeeStore` / `canSeeStickers`)

**Files:**
- Modify: `app/[lang]/layout.tsx`, `components/layout/header.tsx`

**Interfaces:**
- Consumes: `isFeatureAllowed` (Task 3).
- Produces: `Header` accepts `canSeeStore?: boolean` and `canSeeStickers?: boolean` (default `true`); the Store/Stickers links + the cart badge render only when the matching flag is true.

- [ ] **Step 1: Compute the flags in `app/[lang]/layout.tsx`**

Add the import:
```ts
import { isFeatureAllowed } from "@/lib/auth/feature-access";
```
After the existing `const { data: { user } } = await supabase.auth.getUser();`, add:
```ts
  const slimUser = user ? { id: user.id, email: user.email } : null;
  const [canSeeStore, canSeeStickers, isOwner] = await Promise.all([
    isFeatureAllowed("store", slimUser),
    isFeatureAllowed("stickers", slimUser),
    isAdmin(slimUser),
  ]);
```
Then change the `<Header … />` props: replace `isOwner={await isAdmin(user ? { id: user.id, email: user.email } : null)}` with:
```tsx
            isOwner={isOwner}
            canSeeStore={canSeeStore}
            canSeeStickers={canSeeStickers}
```

- [ ] **Step 2: Accept + apply the flags in `components/layout/header.tsx`**

Add the two props to the `Header` signature (default `true`):
```ts
  isOwner = false,
  canSeeStore = true,
  canSeeStickers = true,
}: {
  lang: Locale;
  dict: Dictionary["nav"];
  authDict: Dictionary["auth"];
  user: HeaderUser | null;
  isOwner?: boolean;
  canSeeStore?: boolean;
  canSeeStickers?: boolean;
}) {
```
Wrap the **desktop** Store button (the `<Button asChild size="sm" variant="outline">` containing `/${lang}/store`) in `{canSeeStore && ( … )}`, the **desktop** Stickers button in `{canSeeStickers && ( … )}`, and the desktop `<CartBadge … />` in `{canSeeStore && ( … )}`. Do the same for the **mobile** Store/Stickers buttons in the `{open && ( … )}` block. Admins/owners get `true` for both (computed in Step 1), so they always see the links.

- [ ] **Step 3: Typecheck + build**

Run: `npm run typecheck && npm run build`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
GIT_CONFIG_GLOBAL=/dev/null git add "app/[lang]/layout.tsx" components/layout/header.tsx
GIT_CONFIG_GLOBAL=/dev/null git commit -m "feat(nav): hide restricted feature links from non-allowed users

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 11: Docs, env, and skills cleanup

**Files:**
- Modify: `.env.example`, `docs/sticker-shop-setup.md`, `.claude/skills/sticker-shop/SKILL.md`, `.claude/skills/linecut-website/SKILL.md`

**Interfaces:** none (docs only). Removes every mention of `STICKER_SHOP_PUBLIC` / `STICKER_SHOP_ALLOWED_EMAILS`; documents the DB feature-access system + `/admin/access`.

- [ ] **Step 1: Find every doc/config mention**

Run: `grep -rn "STICKER_SHOP_PUBLIC\|STICKER_SHOP_ALLOWED\|sticker-access\|allow-list" .env.example docs .claude/skills`
Expected: a list of lines in `.env.example`, `docs/sticker-shop-setup.md`, and both `SKILL.md` files. Edit each below.

- [ ] **Step 2: `.env.example`**

Remove the `STICKER_SHOP_PUBLIC` and `STICKER_SHOP_ALLOWED_EMAILS` lines (and any comment header for them). Where they were, add a short note:
```bash
# Feature access (sticker shop + store: public vs restricted, and the allow-list)
# is managed in the app at /<lang>/admin/access — no env vars. The first admin is
# the OWNER_NOTIFY_EMAIL account; more are granted at /<lang>/admin/admins.
```

- [ ] **Step 3: `docs/sticker-shop-setup.md`**

Replace any section describing `STICKER_SHOP_PUBLIC` / `STICKER_SHOP_ALLOWED_EMAILS` with a short paragraph: the sticker shop and store are gated by **DB-managed feature access** (`feature_access` / `feature_allowlist` tables), controlled from **`/<lang>/admin/access`** — per feature choose **Public** or **Restricted**, and for restricted features add allowed users by email (they must have signed up first). Admins/owners always have access. No env vars are involved.

- [ ] **Step 4: `.claude/skills/sticker-shop/SKILL.md`**

Update the "Architecture Invariants" bullet about the shop being PRIVATE + the `lib/auth/sticker-access.ts` env guard, and the "Env Vars" + "Common Mistakes" / "Roadmap" mentions: the shop is gated by the **generic DB feature-access system** (`lib/auth/feature-access.ts` + `feature_access`/`feature_allowlist`, managed at `/admin/access`), not env vars. Note the actions still re-check via `getCurrentUserFeatureAccess("stickers")` (defense in depth) and admins bypass. Remove `STICKER_SHOP_PUBLIC` / `STICKER_SHOP_ALLOWED_EMAILS` from the env list.

- [ ] **Step 5: `.claude/skills/linecut-website/SKILL.md`**

In the sticker-shop summary + "Launch Checklist" + "Roadmap", replace the `STICKER_SHOP_*` env mentions with: feature access (sticker shop + store) is **DB-managed in `/admin/access`** via `lib/auth/feature-access.ts`; move "store product catalog / owner product shop / whitelist features" from roadmap → built where applicable.

- [ ] **Step 6: Verify the env var names are gone from docs/config**

Run: `grep -rn "STICKER_SHOP_PUBLIC\|STICKER_SHOP_ALLOWED" .env.example docs .claude/skills`
Expected: **no output** (all removed).

- [ ] **Step 7: Commit**

```bash
GIT_CONFIG_GLOBAL=/dev/null git add .env.example docs .claude/skills
GIT_CONFIG_GLOBAL=/dev/null git commit -m "docs: feature access is DB-managed (/admin/access); drop STICKER_SHOP_* env

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 12: Full verification + manual e2e

**Files:** none (verification only).

- [ ] **Step 1: Full automated suite**

Run: `npm run test && npm run typecheck && npm run build`
Expected: all PASS — dictionary parity green, `evaluateFeatureAccess` unit test green, no type errors, production build succeeds.

- [ ] **Step 2: Confirm no dangling references**

Run: `grep -rn "sticker-access\|STICKER_SHOP_PUBLIC\|STICKER_SHOP_ALLOWED" . --include="*.ts*" --include="*.json" --include="*.md" | grep -v node_modules | grep -v "docs/superpowers"`
Expected: **no output**.

- [ ] **Step 3: Manual e2e — store default (public)**

Start `npm run dev`. As a **guest**, visit `/he/store` and `/en/store`: the grid loads and you can add to cart + reach checkout (unchanged from today). On each page check RTL is intact: in DevTools console `document.documentElement.scrollWidth === document.documentElement.clientWidth` → `true` on `/he`.

- [ ] **Step 4: Manual e2e — restrict the store**

Sign in as the owner (`OWNER_NOTIFY_EMAIL`). Visit `/he/admin/access`: see **Store** and **Sticker shop** cards. Toggle **Store → Restricted**. Then:
  - In a separate guest/incognito session, visit `/he/store` → redirected to `/he/login`. The **Store** link + cart badge are **hidden** in the guest header.
  - As the owner (admin), `/he/store` still loads and the Store link is still visible (admin bypass).
  - Back in `/he/admin/access`, add a non-admin test user by email (one who has signed up) to the Store allow-list. Sign in as that user → `/he/store` loads and the Store link appears.
  - Add an email that has **not** signed up → expect the `user_not_found` error message.
  - Toggle **Store → Public** again → guest access + header link return.

- [ ] **Step 5: Manual e2e — stickers unchanged + track stays open**

Confirm the sticker shop still behaves as before (restricted): a non-allowed signed-in user hitting `/he/stickers` is redirected home; an allow-listed user gets in. Place/locate a store order and confirm its `/he/store/track/<token>` page still renders even while the store is **restricted** (track is intentionally open). A non-admin visiting `/he/admin/access` is redirected to login.

- [ ] **Step 6: (No commit — verification only.) If any check fails, fix in the owning task and re-run Step 1.**

---

## Self-Review

**Spec coverage:**
- Decision 1 (user_id allow-list) → Tasks 1, 5 (`findUserByEmail` → `user_id`), 7. ✓
- Decision 2 (DB-only, drop env) → Tasks 1 (seed), 8 (delete module), 11 (docs/env). ✓
- Decision 3 (one Feature access page) → Task 7. ✓
- Decision 4 (admins bypass) → Task 2 core + Task 3 `isFeatureAllowed`. ✓
- Decision 5 (header hides restricted links) → Task 10. ✓
- Decision 6 (track stays open) → Task 9 (explicitly not modified) + Task 12 Step 5. ✓
- Data model (two default-deny tables, seed) → Task 1. ✓
- Auth module (registry, pure core, IO wrappers) → Tasks 2–3. ✓
- Enforcement (stickers refactor, store gate, actions) → Tasks 8–9. ✓
- Admin UI + actions + `findUserByEmail` extraction → Tasks 4, 5, 7. ✓
- i18n parity → Task 6. ✓
- Cleanup + docs + skills + README → Tasks 1 (README), 11. ✓
- Testing/verification → Tasks 2 (unit), 6 (parity), 12 (full + e2e). ✓

**Placeholder scan:** No TBD/TODO/"handle edge cases"/"similar to Task N" — every code step contains complete code. ✓

**Type consistency:** `FeatureKey`/`FeatureVisibility`/`evaluateFeatureAccess` signature identical across Tasks 2, 3, 5, 7. `findUserByEmail(admin, email)` identical in Tasks 4 and 5. `isFeatureAllowed(feature, user)` / `getCurrentUserFeatureAccess(feature)` signatures identical across Tasks 3, 8, 9, 10. `FeatureAccessView`/`AllowedUser` defined in Task 5, consumed in Task 7. Dict keys added in Task 6 are exactly those read in Task 7's component (`dict.features[...]`, `dict.visibility[...]`, `dict.publicNote`, `dict.restrictedNote`, `dict.addByEmail`, `dict.emailPlaceholder`, `dict.add`, `dict.adding`, `dict.remove`, `dict.removeConfirm`, `dict.empty`, `dict.addedOn`, `dict.errors.*`) and Task 7's nav (`dict.access`). ✓
