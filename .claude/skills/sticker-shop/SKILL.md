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
5. **Confirm** → server action `confirmOrder({ orderId, guestToken, delivery })`: re-validates, verifies each object exists in S3, calls the payment provider, writes delivery + `payment_status` + `confirmed_at`, sends owner email (best-effort). **Idempotent** — a re-confirm of an already-confirmed order returns success without re-charging/re-emailing.
6. **Track**: guest → `/[lang]/stickers/track/[token]` (by `guest_token`); account → `/[lang]/account/orders` (RLS, own orders). Owner downloads files via `/[lang]/admin/orders/[id]/files` (owner-gated).

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
| **IO cores (DI)** | `lib/orders/` | `create-draft`, `confirm-order`, `order-view`, `draft-schema` |
| Storage | `lib/storage/keys.ts`, `lib/storage/s3.ts` | key scheme + presign/exists/delete |
| Supabase | `lib/supabase/{client,server,admin,proxy}.ts` | browser / RLS / admin / session refresh |
| Payments | `lib/payments/{provider,manual-provider,index}.ts` | swap seam = `getPaymentProvider()` |
| Owner email | `lib/emails/order-notification.ts` | pure builder; sent via Resend in `confirmOrder` |
| Owner gate | `lib/auth/is-owner.ts` | `OWNER_NOTIFY_EMAIL` allow-list |
| Migrations | `supabase/migrations/*.sql` | `orders`, `order_stickers`, enums, RLS |

## Architecture Invariants — do not break these

- **Uploads go browser→S3 directly** via presigned PUT. Never POST files through a Server Action (the ~1MB body cap). To add a file type you must change **all** of: `acceptedMime` in config, the validators (`file-validation`, `draft-schema`), the hardcoded `.webp` extension in `stickerKey` (`lib/storage/keys.ts`), and the `image/webp` `Content-Type` forced in `presignUpload` (`lib/storage/s3.ts`) and `putToPresignedUrl` (`lib/stickers/upload-client.ts`) — but **not** the transport itself.
- **`lib/stickers/` is pure** (no IO, deterministic). `lib/orders/` cores take a `deps` object (`admin`, `presignUpload`, `objectExists`, `paymentProvider`, `sendOwnerEmail`, `ownerFilesUrlFor`). The `"use server"` wrappers in `app/actions/stickers.ts` are the only place that assembles real deps. Keep new IO behind this seam — it's what makes the cores testable.
- **Money is in agorot** (integer minor units) everywhere — config rates, DB `price_*`, payment intents. Only `formatMoney` turns it into a display string. Never store/compare shekels as floats.
- **Pricing is snapshotted** onto the `orders` row (`price_sheets/rate/setup/total`) at draft creation. Past orders must not move when rates change. Don't recompute totals from current config on read.
- **RLS is default-deny.** `orders`/`order_stickers` have a SELECT policy only for `user_id = auth.uid()` (authenticated). There is **no anon read policy**. Guest reads (`getOrderByToken`, `getOrderByGuestToken`) and all writes go through the **admin (service-role) client**, server-side filtered by `guest_token`. Don't add an anon read policy to "make guests work" — that leaks orders.
- **Secrets are server-only.** `lib/supabase/admin.ts` (service-role) and `lib/storage/s3.ts` (AWS keys) are `"use server"` / window-guarded. The browser uses `lib/supabase/client.ts` (anon key) + presigned URLs only.
- **`clientKey` = identity in storage:** `u_<userId>` for logged-in, `g_<guestToken>` for guests. S3 key scheme is `{clientKey}/{orderId}/{stickerId}.webp` (`lib/storage/keys.ts`). Keep keys derived there, not string-built inline.
- **`confirmOrder` is idempotent** and owner-email is best-effort (email failure must not fail the order).
- **DB migrations are Supabase CLI, not Vercel.** Add via `npm run db:new`, apply with `npm run db:push`. The CLI is `npx`-only (not a dependency). See `supabase/migrations/README.md`. Vercel does **not** run migrations.

## Pricing & Packing

- Config: `lib/stickers/sticker-config.ts` — `stickerSizeMm` 50, `gutterMm` 3, A4 sheet `210×297` margin `8`, `maxStickers` 200, `maxFileBytes` 5 MiB, `acceptedMime` `image/webp`. **`perSheetRate` and `setupFee` are `0` (agorot) until the client sets real values** — while `0`, the UI shows a "price confirmed before printing" message rather than a price.
- `computePacking` → how many stickers fit per A4 sheet. `computePrice(uniqueCount, copies)` → `sheetsPerSet = ceil(unique/perSheet)`, `totalSheets = sheetsPerSet * copies`, `total = totalSheets*perSheetRate + setupFee`. Both pure and unit-tested.

## Schema (quick)

- `orders`: `id`, `user_id?` (FK auth.users, SET NULL), `guest_token` (unique hex), `status` (`order_status`), `payment_status` (`payment_status`), contact + `delivery_method` (`pickup`/`shipping`) + ship_* fields, `copies`, `price_*` (agorot), timestamps, `confirmed_at` (**NULL = draft**).
- `order_stickers`: `order_id` (FK CASCADE), `storage_key`, `original_filename`, `width/height`, `bytes`, `content_type`, `sort_index`.
- Enums: `order_status` (received/in_production/ready/shipped/delivered/cancelled), `payment_status` (awaiting_payment/paid/refunded/waived), `delivery_method`.

## Env Vars (setup)

`NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `AWS_REGION`, `S3_STICKERS_BUCKET`, `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY`, `OWNER_NOTIFY_EMAIL`, `RESEND_API_KEY`, `CONTACT_FROM` (Resend-verified domain), optional `ORDER_FILES_LINK_TTL` (default 7d). Also: enable Supabase **Email + Google** providers + Site/Redirect URLs; **apply the S3 bucket CORS rule** (PUT/GET from the site origin — the app IAM user can't set it; see `docs/sticker-shop-setup.md`); apply migrations with `npm run db:push`. Full list in `linecut-website`'s launch checklist.

## Common Mistakes

- Building S3 keys inline instead of via `lib/storage/keys.ts` → orphaned files / broken owner downloads.
- Adding an anon RLS read policy to support guests → use the admin client + `guest_token` filter instead.
- Recomputing price on read from current config → breaks historical orders; read the snapshot.
- Treating money as shekels/floats → keep agorot integers; format only at the edge.
- Routing file bytes through a Server Action → use presigned PUT from the browser.
- Adding a payment gateway in the action → implement `PaymentProvider` and swap in `lib/payments/index.ts`.
- Editing only one of `he.json`/`en.json` for new shop copy → the parity test fails (see `rtl-bilingual-nextjs`).

## Roadmap seams (architected, not built)

Real payment gateway (behind `PaymentProvider`), admin order dashboard, orphaned-draft cleanup cron (`confirmed_at IS NULL`), "add as store product" catalog. Keep new data/IO behind `lib/` + Server Actions.

## Maintenance

This guide is part of the code. When you change the order flow, the action/core seam, the schema/RLS, the key scheme, pricing, or env/setup, update this file in the same change (and `linecut-website` / `docs/sticker-shop-setup.md` / migrations README where they overlap).
