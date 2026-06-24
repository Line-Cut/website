---
name: sticker-shop
description: Use when working on the Line Cut sticker shop in this repo — the /[lang]/stickers upload→A4 preview→checkout→order flow, order/payment/email logic, Supabase orders/order_stickers tables + RLS, S3 presigned uploads, pricing/packing math, guest vs account orders, or owner order access. Covers where each piece lives and the invariants that must not break.
---

# Line Cut Sticker Shop

## Overview

The sticker shop lets a customer upload WhatsApp `.webp` stickers, see a live **A4 sheet preview + price**, check out (delivery details), and **place an order with payment deferred**, then track it via a guest link or account history. Entry point: the header "Sticker shop" button → `/[lang]/stickers`.

**This skill is a sub-area of `linecut-website`.** For i18n/RTL/dictionary mechanics (the parity test, `app/[lang]`, logical CSS, Hebrew-first), **REQUIRED SUB-SKILL: use `rtl-bilingual-nextjs`**; for brand voice, design tokens, and component conventions, **use `linecut-website`**. This guide covers only the sticker-shop architecture.

**Core architecture principle:** pure logic in `lib/stickers/`, dependency-injected IO cores in `lib/orders/`, and thin `"use server"` action wrappers in `app/actions/stickers.ts`. Secrets live only in server-only modules; the browser only ever gets presigned URLs and the anon key.

## When to Use

- Editing the upload tool, A4 preview, copies stepper, price breakdown, or checkout form.
- Touching order creation/confirmation, payment, owner email, or order views (guest/account).
- Changing pricing, packing (stickers-per-sheet), file validation, or sticker config.
- Working on the Supabase schema/RLS, S3 keys/presigning, or auth/owner-gating for the shop.
- Wiring a real payment gateway, an admin dashboard, or draft cleanup.

## Order Lifecycle (the flow)

1. **Build** (`/[lang]/stickers`, `StickerTool` client component): pick/drop `.webp` files → local `LocalSticker` previews, probe dimensions, choose `copies`. Live price via pure `computePrice`.
2. **Create draft** → server action `createOrderDraft({ stickers: StickerMeta[], copies })`: validates, computes price, inserts `orders` (draft: `confirmed_at IS NULL`) + `order_stickers` rows, mints **presigned S3 PUT URLs**, returns `{ orderId, guestToken, uploads:[{stickerId,key,url}] }`. Client stashes `orderId`+`guestToken` (sessionStorage).
3. **Upload** browser→S3 **direct** via `uploadFiles` (presigned PUT, `Content-Type: image/webp`, bounded concurrency, one retry). Files never pass through a Server Action (~1MB cap).
4. **Checkout** (`/[lang]/stickers/checkout`, `CheckoutForm`): delivery details (pickup vs shipping).
5. **Confirm** → server action `confirmOrder({ orderId, guestToken, delivery })`: re-validates, verifies each object exists in S3, then **re-keys** the files into the friendly per-order folder `<orderId>-<firstName>-<lastName>-<phone>/` in the orders bucket and writes a **`metadata.pdf`** (client details, Hebrew-capable) alongside them (the temp `{clientKey}/{orderId}/` prefix is deleted). Calls the payment provider (**mocked → `paid`** today); writes delivery + first/last name + `payment_status`/`payment_reference`/`paid_at` + `storage_prefix` + `confirmed_at`. When paid, runs the **paid pipeline** (`lib/orders/mark-paid.ts`, best-effort): copies the order folder to the **paid bucket** and writes a **`receipt.pdf`** seam. Sends owner email (best-effort). **Idempotent** — a re-confirm of an already-confirmed order returns success without re-doing any of this.
6. **Track**: guest → `/[lang]/stickers/track/[token]` (by `guest_token`); account → `/[lang]/account/orders` (RLS, own orders). Owner downloads files via `/[lang]/admin/orders/[id]/files` (owner-gated).

**Saved drafts (signed-in only).** A draft = an `orders` row with `confirmed_at IS NULL` + `user_id`. Signed-in users get a **"Save draft"** button in the builder (guests don't) and can edit until checkout: the builder loads a draft via **`/[lang]/stickers?draft=<id>`** (`getDraftForEdit` → remote stickers shown via presigned GET alongside new local ones); saving calls `updateOrderDraft` (diff: delete removed S3+DB, presign+insert added, re-snapshot price) or `createOrderDraft` on first save. "Continue to checkout" also persists, so an abandoned checkout stays resumable. The account page lists drafts (`getUserDrafts`) with **Continue editing / Continue to checkout / Discard** (`discardDraft`). Draft files stay temp-keyed (`u_<userId>/<orderId>/`); the friendly re-key happens only at confirm. Cores: `lib/orders/{update-draft,draft-view,discard-draft}.ts`; actions: `updateOrderDraft`/`getUserDrafts`/`getDraftForEdit`/`discardDraft`. All draft writes are owner+draft guarded (`already_finalized` once confirmed).

## File Map

| Area | Path | Notes |
|---|---|---|
| Build page / tool | `app/[lang]/stickers/page.tsx`, `components/stickers/sticker-tool.tsx` | server page → client tool |
| Checkout | `app/[lang]/stickers/checkout/page.tsx`, `components/stickers/checkout-form.tsx` | `force-dynamic` |
| Guest track | `app/[lang]/stickers/track/[token]/page.tsx` | `getOrderByToken` |
| Account orders | `app/[lang]/account/orders/page.tsx` | requires login; `getUserOrders` |
| Auth | `app/[lang]/login`, `signup`, `auth/callback/route.ts` | Google + email; callback guards open-redirect on `next` |
| Owner files | `app/[lang]/admin/orders/[id]/files/route.ts` | `isOwnerEmail` gate; admin client + presigned GET |
| **Server actions** | `app/actions/stickers.ts` | `createOrderDraft`, `confirmOrder` — build deps, wrap lib cores |
| **Pure logic** | `lib/stickers/` | pricing, packing, file-validation, format, schemas, types, config |
| Upload (browser) | `lib/stickers/upload-client.ts` | browser-safe, no server imports |
| **IO cores (DI)** | `lib/orders/` | `create-draft`, `update-draft`, `draft-view` (list/get drafts), `discard-draft`, `confirm-order`, `order-view`, `draft-schema`, `mark-paid` (paid pipeline) |
| Drafts UI | `components/stickers/draft-list.tsx` | account "In-progress" list (continue/checkout/discard) |
| PDF builders | `lib/pdf/order-metadata-pdf.ts`, `lib/pdf/receipt-pdf.ts` | metadata (Hebrew via DejaVuSans + bidi-js) / receipt seam; font in `lib/pdf/fonts/` (traced in `next.config.ts`) |
| Storage | `lib/storage/keys.ts`, `lib/storage/s3.ts` | key scheme + friendly prefix + presign/exists/delete + `putObject`/`copyObject`/`copyPrefix`; two buckets |
| Supabase | `lib/supabase/{client,server,admin,proxy}.ts` | browser / RLS / admin / session refresh |
| Payments | `lib/payments/{provider,manual-provider,index}.ts` | swap seam = `getPaymentProvider()`; mock returns `paid` |
| Owner email | `lib/emails/order-notification.ts` | pure builder; sent via Resend in `confirmOrder` |
| Owner gate | `lib/auth/is-owner.ts` | `OWNER_NOTIFY_EMAIL` allow-list (order notifications + file downloads) |
| Shop access gate | `lib/auth/sticker-access.ts` | `isStickerShopRestricted` (`STICKER_SHOP_PUBLIC` kill-switch) + `isStickerShopUser` allow-list (`STICKER_SHOP_ALLOWED_EMAILS`) |
| Migrations | `supabase/migrations/*.sql` | `orders`, `order_stickers`, enums, RLS |

## Architecture Invariants — do not break these

- **The shop is PRIVATE by default — a server-side email allow-list, with a public kill-switch.** While restricted, only allow-listed signed-in accounts may build, save, edit, or place orders. The guard is `lib/auth/sticker-access.ts`: `isStickerShopRestricted()` (true unless `STICKER_SHOP_PUBLIC` is truthy) + `isStickerShopUser(email)` (default emails baked in, override via `STICKER_SHOP_ALLOWED_EMAILS`). Setting `STICKER_SHOP_PUBLIC=true` opens the shop to **everyone, guests included** (the original behavior — `createOrderDraft`/`confirmOrder` then allow a `null` userId again). Enforced in **both** places: the `/[lang]/stickers` and `/[lang]/stickers/checkout` pages redirect non-allowed visitors (guests → `login`, others → home), **and** every action in `app/actions/stickers.ts` re-checks (actions are directly callable, so the page gate alone is not enough). Two helpers there: `checkStickerAccess()` for guest-capable actions (create/confirm — allowed for guests when public) and `requireStickerUser()` for the signed-in-only draft actions; denials return `{ ok: false, message: "forbidden" }`. Don't add an order action without one of these gates.
- **Uploads go browser→S3 directly** via presigned PUT. Never POST files through a Server Action (the ~1MB body cap). To add a file type you must change **all** of: `acceptedMime` in config, the validators (`file-validation`, `draft-schema`), the hardcoded `.webp` extension in `stickerKey` (`lib/storage/keys.ts`), and the `image/webp` `Content-Type` forced in `presignUpload` (`lib/storage/s3.ts`) and `putToPresignedUrl` (`lib/stickers/upload-client.ts`) — but **not** the transport itself.
- **`lib/stickers/` is pure** (no IO, deterministic). `lib/orders/` cores take a `deps` object (`confirmOrder`: `admin`, `objectExists`, `copyObject`, `putObject`, `deletePrefix`, `buildMetadataPdf`, `paymentProvider`, `markOrderPaid`, `sendOwnerEmail`, `ownerFilesUrlFor`). The `"use server"` wrappers in `app/actions/stickers.ts` are the only place that assembles real deps. Keep new IO behind this seam — it's what makes the cores testable.
- **Two buckets.** `S3_STICKERS_BUCKET` (orders — all orders; the browser uploads here) and `S3_STICKERS_PAID_BUCKET` (paid — copied at payment + holds the receipt). `lib/storage/s3.ts` functions take `{ bucket: "orders" | "paid" }` (default orders). Only the orders bucket needs CORS (browser PUT); the paid copy + receipt are written server-side.
- **Phone is required, enforced in the backend** (`checkout-schema.ts` + a DB CHECK `confirmed_at IS NULL OR contact_phone IS NOT NULL`). Name is split into `firstName`/`lastName` (the friendly folder needs both); `contact_name` is kept = `"<first> <last>"` for the email/read views.
- **The friendly folder is the source of truth at/after confirm** — stored on `orders.storage_prefix` (sanitization isn't reversible; read the column, don't re-derive). Re-key + paid-copy are **idempotent**, and `confirmed_at` is set last so a failed attempt re-runs cleanly. The paid pipeline (`markOrderPaid`) is best-effort + self-contained so the future gateway webhook can call it directly.
- **Money is in agorot** (integer minor units) everywhere — config rates, DB `price_*`, payment intents. Only `formatMoney` turns it into a display string. Never store/compare shekels as floats.
- **Pricing is snapshotted** onto the `orders` row (`price_sheets/rate/setup/total`) at draft creation. Past orders must not move when rates change. Don't recompute totals from current config on read.
- **RLS is default-deny.** `orders`/`order_stickers` have a SELECT policy only for `user_id = auth.uid()` (authenticated). There is **no anon read policy**. Guest reads (`getOrderByToken`, `getOrderByGuestToken`) and all writes go through the **admin (service-role) client**, server-side filtered by `guest_token`. Don't add an anon read policy to "make guests work" — that leaks orders.
- **Secrets are server-only.** `lib/supabase/admin.ts` (service-role) and `lib/storage/s3.ts` (AWS keys) are `"use server"` / window-guarded. The browser uses `lib/supabase/client.ts` (anon key) + presigned URLs only.
- **`clientKey` = identity in storage:** `u_<userId>` for logged-in, `g_<guestToken>` for guests. **Temp upload** key (draft) is `{clientKey}/{orderId}/{stickerId}.webp`; at **confirm** the files are re-keyed to the friendly `<orderId>-<first>-<last>-<phone>/<stickerId>.webp` (root of the bucket, no clientKey prefix), with `metadata.pdf` / `receipt.pdf` alongside. All keys derive from `lib/storage/keys.ts` (`stickerKey`, `friendlyOrderPrefix`, `friendlyStickerKey`, `metadataKey`, `receiptKey`) — never string-built inline.
- **`confirmOrder` is idempotent** and owner-email is best-effort (email failure must not fail the order).
- **DB migrations are Supabase CLI, not Vercel.** Add via `npm run db:new`, apply with `npm run db:push`. The CLI is `npx`-only (not a dependency). See `supabase/migrations/README.md`. Vercel does **not** run migrations.

## Pricing & Packing

- Config: `lib/stickers/sticker-config.ts` — `stickerSizeMm` 50, `gutterMm` 3, A4 sheet `210×297` margin `8`, `maxStickers` 200, `maxFileBytes` 5 MiB, `acceptedMime` `image/webp`. **`perSheetRate` and `setupFee` are `0` (agorot) until the client sets real values** — while `0`, the UI shows a "price confirmed before printing" message rather than a price.
- `computePacking` → how many stickers fit per A4 sheet. `computePrice(uniqueCount, copies)` → `sheetsPerSet = ceil(unique/perSheet)`, `totalSheets = sheetsPerSet * copies`, `total = totalSheets*perSheetRate + setupFee`. Both pure and unit-tested.

## Schema (quick)

- `orders`: `id`, `user_id?` (FK auth.users, SET NULL), `guest_token` (unique hex), `status` (`order_status`), `payment_status` (`payment_status`), `contact_name` + `contact_first_name`/`contact_last_name` + `contact_email`/`contact_phone`, `delivery_method` (`pickup`/`shipping`) + ship_* fields, `copies`, `price_*` (agorot), `storage_prefix` (friendly folder), `payment_reference`/`paid_at`/`receipt_storage_key`/`payment_meta`, timestamps, `confirmed_at` (**NULL = draft**). CHECK: confirmed orders must have `contact_phone`.
- `order_stickers`: `order_id` (FK CASCADE), `storage_key` (temp at draft → friendly at confirm), `original_filename`, `width/height`, `bytes`, `content_type`, `sort_index`.
- Enums: `order_status` (received/in_production/ready/shipped/delivered/cancelled), `payment_status` (awaiting_payment/paid/refunded/waived), `delivery_method`.

## Env Vars (setup)

`NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `NEXT_PUBLIC_SITE_URL` (canonical origin — the OAuth redirect is built from it; `auth-form.tsx` falls back to `location.origin` when unset), `AWS_REGION`, `S3_STICKERS_BUCKET`, `S3_STICKERS_PAID_BUCKET` (paid orders, same region), `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY`, `OWNER_NOTIFY_EMAIL`, `RESEND_API_KEY`, `CONTACT_FROM` (Resend-verified domain), optional `ORDER_FILES_LINK_TTL` (default 7d), optional `STICKER_SHOP_PUBLIC` (truthy ⇒ open the shop to everyone, bypassing the allow-list) and `STICKER_SHOP_ALLOWED_EMAILS` (comma-separated; overrides the built-in shop access allow-list while restricted). Also: enable Supabase **Email + Google** providers + set Site/Redirect URLs to match `NEXT_PUBLIC_SITE_URL` (add `<origin>/**` to Redirect URLs, else Google sign-in falls back to the Site URL = localhost:3000); **apply the S3 CORS rule to the orders bucket** (PUT/GET from the site origin — the paid bucket needs no CORS; the app IAM user can't set it; see `docs/sticker-shop-setup.md`); the IAM policy must cover **both** buckets; apply migrations with `npm run db:push`. Full list in `linecut-website`'s launch checklist.

## Common Mistakes

- Building S3 keys inline instead of via `lib/storage/keys.ts` → orphaned files / broken owner downloads.
- Adding an anon RLS read policy to support guests → use the admin client + `guest_token` filter instead.
- Recomputing price on read from current config → breaks historical orders; read the snapshot.
- Treating money as shekels/floats → keep agorot integers; format only at the edge.
- Routing file bytes through a Server Action → use presigned PUT from the browser.
- Adding a payment gateway in the action → implement `PaymentProvider` and swap in `lib/payments/index.ts`. The post-payment storage/receipt step is `markOrderPaid` (reuse it from the webhook).
- Re-deriving the friendly prefix from name/phone instead of reading `orders.storage_prefix` → sanitization isn't reversible; read the column.
- Drawing Hebrew in a PDF without the embedded font + bidi reorder → tofu/reversed text. The metadata PDF uses DejaVuSans (Latin+Hebrew) + bidi-js; the font is fs-read at runtime and must stay traced in `next.config.ts`.
- Editing only one of `he.json`/`en.json` for new shop copy → the parity test fails (see `rtl-bilingual-nextjs`).

## Roadmap seams (architected, not built)

Real payment gateway (behind `PaymentProvider`; drive `markOrderPaid` from its webhook — set payment status/ref, then copy + receipt) and a **real receipt** (today `lib/pdf/receipt-pdf.ts` writes a placeholder); admin order dashboard, orphaned-draft cleanup cron (target only **guest/abandoned** drafts — signed-in `confirmed_at IS NULL` drafts are now intentional, resumable orders), "add as store product" catalog. Keep new data/IO behind `lib/` + Server Actions.

## Maintenance

This guide is part of the code. When you change the order flow, the action/core seam, the schema/RLS, the key scheme, pricing, or env/setup, update this file in the same change (and `linecut-website` / `docs/sticker-shop-setup.md` / migrations README where they overlap).
