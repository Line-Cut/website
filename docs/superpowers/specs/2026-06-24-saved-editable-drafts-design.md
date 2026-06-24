# Saved, editable sticker-order drafts (signed-in users)

- **Date:** 2026-06-24
- **Status:** Approved design → ready for implementation plan
- **Area:** Line Cut sticker shop (`/[lang]/stickers`) — see `sticker-shop` / `linecut-website` skills.

## Context / problem

Today an in-progress sticker order is only persisted server-side at the moment the
customer leaves the builder for checkout (`StickerTool.handleContinue` →
`createOrderDraft` + browser→S3 upload). Before that, stickers live purely in
client memory (`items` / `filesRef`). There is **no way to load an existing draft
back into the builder**, so going back to edit creates a *new* order and orphans
the old one, and the account page hides drafts (`getUserOrders` filters
`confirmed_at IS NOT NULL`).

The customer should be able to **modify the order content (add/remove stickers,
change quantity) up until checkout/payment**, have that in-progress order **saved**,
and **finalize it later**.

## Decisions (locked with the user)

1. **Save model = explicit "Save draft"** (not autosave-from-first-sticker).
2. **Signed-in users only.** Guests keep today's ephemeral build→checkout→confirm
   flow with no saved/resumable draft.
3. **Multiple drafts per user**, listed in an **"In-progress" section on the
   account orders page**, each with **Continue editing**, **Continue to checkout**,
   and **Discard**.
4. **"Continue to checkout" also persists the draft**, so an abandoned checkout
   leaves a resumable draft (no separate save needed to get resumability).

## Goals / non-goals

**Goals**
- A signed-in user can save an in-progress order, leave, and resume + finalize it
  later (another session/device) from their account.
- While a draft, the order content is fully editable: add stickers, remove
  stickers, change `copies`; price re-snapshots on each save.
- Editing is locked once the order is confirmed (`confirmOrder` is the boundary).

**Non-goals (out of scope)**
- Guest saved drafts (guests unchanged).
- Autosave / per-keystroke persistence.
- Renaming/labelling drafts, multi-device live sync, draft sharing.
- Changing the friendly-folder re-key, payment, or receipt logic (unchanged).

## Architecture

Make the **existing draft row first-class** — a draft already *is* an `orders` row
with `confirmed_at IS NULL` + `user_id` set + its `order_stickers`. We add
create/update/list/get/discard operations around that same row and let the builder
load a draft. **No DB migration**: reuses the schema, RLS (a signed-in user can
already `SELECT` their own rows), the `lib/storage/keys.ts` scheme, and
`computePrice`.

Follows the existing seam: **pure logic in `lib/stickers/`, DI IO-cores in
`lib/orders/`, thin `"use server"` wrappers in `app/actions/stickers.ts`.** All
writes/guest-or-owner reads go through the admin (service-role) client, filtered
server-side (per the RLS invariant). Secrets stay server-only; the browser gets
presigned URLs only.

**Draft storage stays under the temp key** `u_<userId>/<orderId>/<stickerId>.webp`
while editing. The friendly-folder re-key + `metadata.pdf` + paid-bucket copy still
happen **only at confirm** (`confirmOrder`) — unchanged.

*Alternative considered & rejected:* a separate "cart" concept distinct from
orders — duplicates orders/keys/pricing for no gain (YAGNI).

## Data model

No schema change. A **draft** = `orders` row where `confirmed_at IS NULL` AND
`user_id = <signed-in user>`. `order_stickers` holds its stickers (temp
`storage_key`). `updated_at` (existing trigger) orders the account list. The
existing `guest_token` on the row is reused as the checkout handle for the owner.

## Server actions / cores

New cores in `lib/orders/`, wrapped in `app/actions/stickers.ts`. All draft writes
verify **ownership** (`user_id = session user`) and **draft state**
(`confirmed_at IS NULL`); a confirmed/again-owned-by-someone-else order →
`not_found`; an already-confirmed order → `already_finalized`.

- **`createOrderDraft(input)`** *(existing, unchanged)* — first save of a new build.
  For signed-in users `user_id` is set (already the case).

- **`updateOrderDraft({ orderId, keepStickerIds, addStickers, copies })`** *(new →
  `lib/orders/update-draft.ts`)*:
  1. Validate (zod): `copies ≥ 1`; `addStickers` are valid `StickerMeta`; final
     count = `keepStickerIds.length + addStickers.length` is `≥ 1` and `≤ maxStickers`.
  2. Load order by `id` + `user_id`; guard draft state.
  3. **Remove**: existing stickers whose id ∉ `keepStickerIds` → delete their S3
     objects (`deleteObjects`, new in `s3.ts`) + delete their `order_stickers` rows.
  4. **Add**: insert rows for `addStickers` (new ids, temp `stickerKey`,
     `sort_index` appended after the current max) → mint presigned PUT URLs.
  5. **Re-snapshot price** over the new unique count + `copies`; update
     `orders.price_*` + `copies`.
  6. Return `{ ok, uploads: [{ stickerId, key, url }] }` for the **added** stickers
     (browser uploads them, same direct-PUT transport as create).
  - Client sends only `keepStickerIds` + `addStickers`; "removed" is derived
    server-side (existing − keep) so the client never names deletions directly.

- **`getUserDrafts()`** *(new)* — the session user's drafts (`confirmed_at IS NULL`),
  each with: `orderId`, `guestToken` (owner's own row, used as the checkout handle),
  sticker count, a **thumbnail** (presigned GET of the first sticker), price
  snapshot, `updatedAt`.

- **`getDraftForEdit(orderId)`** *(new)* — owner+draft-checked; returns `copies` +
  the draft's stickers as `[{ id, storageKey, filename, width, height, bytes,
  url }]` (presigned GET `url` for the builder thumbnail).

- **`discardDraft(orderId)`** *(new)* — owner+draft-checked; `deletePrefix` the
  order's temp S3 prefix + delete the `orders` row (cascade removes
  `order_stickers`).

New `s3.ts` helper: **`deleteObjects(keys, opts?)`** (batch `DeleteObjectsCommand`
for specific keys) — complements `deletePrefix`.

## Builder changes (`components/stickers/sticker-tool.tsx`)

- Reads an optional **`?draft=<id>`**. On mount with a draft id, calls
  `getDraftForEdit` and seeds `items` with the existing stickers.
- `LocalSticker` gains a **`remote` flag**: remote stickers carry the DB sticker
  `id` + `storageKey` + a presigned thumbnail `url` and have **no local `File`**;
  newly added stickers are local (`File` in `filesRef`) and upload on save.
- **Signed-in users** get a **"Save draft"** button alongside **"Continue to
  checkout."** Both persist:
  - no draft id yet → `createOrderDraft` (first save) → upload new files;
  - editing an existing draft → `updateOrderDraft` with `keepStickerIds` (remaining
    remote ids) + `addStickers` (new local metas) → upload new files.
  - "Save draft" stays/returns to account; "Continue to checkout" also stashes the
    `{ orderId, guestToken }` handle and navigates to checkout.
- **Guests**: no "Save draft" button; "Continue to checkout" behaves exactly as
  today.
- Removing all stickers disables saving (min 1, matching create).
- Whether the user is signed in is passed from the server page (it already has the
  Supabase session) into `StickerTool`.

## Account page changes (`app/[lang]/account/orders/page.tsx`)

New **"In-progress"** section above confirmed orders, from `getUserDrafts()`: each
draft shows thumbnail + sticker count + updated date and three actions —
**Continue editing** (`/[lang]/stickers?draft=<id>`), **Continue to checkout**
(stash `{ orderId, guestToken }` → `/[lang]/stickers/checkout`), **Discard**
(`discardDraft`, with a confirm). New presentational component
(`components/stickers/draft-list.tsx`); copy added to both `he.json` + `en.json`
(parity test).

## Edge cases / error handling

- **Ownership / state guards** on every draft action: foreign or missing order →
  `not_found`; already-confirmed → `already_finalized` (editing is locked at
  confirm).
- **Partial uploads** of added stickers: same handling as create (bounded
  concurrency + one retry); the draft simply has rows whose objects may not yet
  exist — `confirmOrder` already verifies object existence before finalizing.
- **Concurrent edits** (two tabs): last write wins on the row; acceptable for v1.
- **Discard race / double-click**: `discardDraft` is idempotent (missing row → ok).
- **Min/max stickers** enforced in `updateOrderDraft` validation, mirroring
  `draft-schema`.

## Testing

- **`lib/orders/update-draft.ts`** (DI core): add-only, remove-only, mixed
  add/remove diff; S3 delete of removed; presign of added; price re-snapshot;
  owner guard (`not_found`); draft guard (`already_finalized`); min/max validation.
- **`getUserDrafts` / `getDraftForEdit` / `discardDraft`**: owner-scoping, draft
  filtering, thumbnail presign, cascade delete.
- **`lib/storage/s3.ts`**: `deleteObjects` batch (mirroring existing SDK-mock tests).
- **Builder**: loads remote stickers into the grid; mixes remote + new local;
  Save vs Continue calls the right action; guest sees no "Save draft" button;
  remove-all disables save.
- **Account**: drafts section renders; continue/checkout/discard wiring.
- Dictionary **parity test** stays green for new copy.

## Out of scope / future

Guest drafts, autosave, draft labels/notes, multi-device live sync, and the
orphaned-draft cleanup cron (still a roadmap seam — note that signed-in drafts are
now intentional, so cleanup should target only *guest*/abandoned drafts).
