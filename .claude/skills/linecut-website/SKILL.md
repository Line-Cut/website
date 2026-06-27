---
name: linecut-website
description: Use when working on the Line Cut Ltd. website in this repo — adding or editing marketing sections/pages, copy, design, or i18n; matching the brand's voice and visuals; or building the planned auth / sticker-shop phases. Onboarding reference for this project's facts, design tokens, and component conventions.
---

# Line Cut Ltd. Website — Project Guide

## Overview

This repo is the bilingual (**Hebrew-first RTL + English LTR**) marketing site for **Line Cut Ltd.**, a digital printing / cutting / finishing production house. Stack: Next.js 16 App Router + React 19 + Tailwind v4 + framer-motion, deployed on Vercel. Phase 1 (landing page) is complete; auth + a sticker shop are planned.

**For all i18n / RTL / dictionary mechanics** (the `app/[lang]` structure, `proxy.ts`, dictionary loading, the **parity test**, deriving the `Dictionary` type, logical CSS, phone `dir="ltr"`): **REQUIRED SUB-SKILL — use `rtl-bilingual-nextjs`.** This guide covers only what's specific to Line Cut.

## Business Facts

- **Name:** Line Cut Ltd. (ליין קאט) · **Address:** HaSadna 8, Holon, Israel · **Business ID:** 516741998
- **Field:** wide-format digital printing, precision cutting, signage, stickers, exhibition/museum graphics, rigid-material printing, custom production.
- Contact details, socials, and hours live in **`lib/site-config.ts`** (placeholders marked `TODO(client)`) — never hard-code them in components. The canonical origin `siteConfig.url` is driven by **`NEXT_PUBLIC_SITE_URL`** (falls back to the production domain) and is used for metadata, the sitemap, and the Supabase OAuth redirect.

## Voice & Tone

Professional, clear, direct, technically capable, **confident without being salesy**. Position as a **reliable, precise, fast production partner — NOT a cheap print shop.**
**Avoid:** cheap-pricing language, machine model names, internal systems/workflow tools, operational problems. Main message: *"Digital printing, cutting and finishing — produced accurately from your file."*

## Design System (editorial minimal)

Tokens are defined in `app/globals.css` as Tailwind v4 `@theme` colors. **Use the tokens, never raw Tailwind colors like `green-50` or `gray-600`:**

| Token | Value | Use |
|---|---|---|
| `bg-paper` | `#FFFFFF` | primary page background (white) |
| `bg-paper-2` | `#FAFAFA` | alternating section background |
| `text-ink` / `bg-ink` | `#141414` | primary text / light dark sections |
| `bg-ink-deep` | `#0E0E0E` | deep dark sections (Why + Clients strips) |
| `text-muted` | `#5B5B5B` | secondary text — AA-safe on paper |
| `text-accent` / `bg-accent` | `#B8281F` | brick-red accent, **CTAs and small accents only** |
| `accent-600` | — | accent hover |
| `border-line` | `#ECECEC` | hairlines |
| dark sections | `bg-ink-deep text-paper` | Why + Clients; `bg-ink` for lighter dark sections |

Fonts: `font-display` = **Heebo** (headings), `font-sans` = Assistant (body) — both Hebrew+Latin, via `next/font`. Logo: `public/F_LINE_CUT_LOGO.svg`.

**Gallery → Portfolio:** The homepage gallery section is now a **horizontal-scroll Portfolio** strip. Projects are sourced from the `PROJECTS` array in `lib/content.ts` (type `Project`), rendered in `components/sections/gallery.tsx` (the file kept its `gallery` name and the `SECTION_IDS.work` anchor; only the styling changed).

## Component Conventions

- Files are **kebab-case**, components use **named exports**: `components/sections/hero.tsx` → `export function Hero(...)`. (Not `Hero.tsx` / `export default`.)
- Sections live in `components/sections/`, layout in `components/layout/`, primitives in `components/ui/`.
- Wrap section content width in **`<Container>`** (`components/layout/container.tsx`), not a raw `mx-auto max-w-* `.
- Wrap each section's content in **`<Reveal>`** (`components/motion/reveal.tsx`) for the scroll-reveal animation (it respects `prefers-reduced-motion`).
- Every section has a stable anchor id from **`SECTION_IDS`** in `lib/content.ts`; repeated structural keys (service/value-prop/FAQ keys, icons) also live there — not inline in components.
- All copy comes from `app/[lang]/dictionaries/{he,en}.json` (see `rtl-bilingual-nextjs` for the parity test). Components receive typed slices: `dict: Dictionary["hero"]`.
- **Brand icons:** `lucide-react` v1 dropped `Instagram`/`Facebook` — import them from `components/ui/social-icons.tsx` (shared inline SVGs). Other icons come from lucide.
- Contact form = Zod schema (`lib/contact-schema.ts`) → Server Action (`app/actions/contact.ts`, Resend) + a WhatsApp deep link via `whatsappLink()`.

## Recipe: add a homepage section

1. Add a `SECTION_IDS` entry (and any structural keys) in `lib/content.ts`.
2. Add the section's copy to **both** `he.json` and `en.json` (identical shape — parity test must pass).
3. Create `components/sections/<name>.tsx`: `export function <Name>({ dict }: { dict: Dictionary["<name>"] })`, wrapped in `<Container>` + `<Reveal>`, using design tokens + logical CSS, `id={SECTION_IDS.<name>}`.
4. Mount it in `app/[lang]/page.tsx` in the right order, passing `dict.<name>`.
5. Verify: `npm test` (parity), `npm run typecheck && npm run build`, and load `/he` + `/en` checking `scrollWidth === clientWidth`.

## Sticker shop (Phase 2 — built)

**For sticker-shop work, REQUIRED SUB-SKILL: use `sticker-shop`** — it covers the order flow, the action/core seam, schema/RLS, S3 presigning, pricing, and the invariants in depth. The summary below is just orientation.

The `/[lang]/stickers` flow: upload WhatsApp `.webp` stickers → A4 preview + live price → checkout (first/last name, **required phone**, delivery) → place order (payment **mocked → paid** today; real non-standard gateway pending) → guest tracking link / account history. Architecture:
- **Supabase** = Postgres (orders, order_stickers) + Auth (Google + email/password). **AWS S3** = **two private buckets**: `S3_STICKERS_BUCKET` (orders) + `S3_STICKERS_PAID_BUCKET` (paid). Temp upload key `{clientKey}/{orderId}/{stickerId}.webp` (`clientKey` = `u_<userId>`/`g_<guestToken>`); at confirm files are re-keyed into the friendly `<orderId>-<first>-<last>-<phone>/` folder with a `metadata.pdf`, and on payment the folder is copied to the paid bucket + a `receipt.pdf` written.
- **Uploads go browser→S3 direct** via presigned PUT URLs (Server Actions cap at ~1MB) — never POST files through an action. Only the orders bucket needs CORS.
- Pure pricing/packing/validation in `lib/stickers/`; DI cores in `lib/orders/` (`create-draft`, `confirm-order`, `order-view`) with thin `"use server"` wrappers in `app/actions/stickers.ts`. Secrets only in server-only modules (`lib/supabase/admin.ts`, `lib/storage/s3.ts`); browser uses `lib/supabase/client.ts` + presigned URLs.
- **DB migrations** = Supabase CLI: files in `supabase/migrations/<ts>_name.sql`, `npm run db:push` / `db:new`. Vercel does NOT run migrations — they apply via CI/CLI (see `supabase/migrations/README.md`). The CLI is `npx`-only (not a dep) to keep Vercel installs lean.
- RLS is default-deny; guest reads go through the admin client filtered by `guest_token` (no anon read policy). Owner files route is gated by `isOwnerEmail` (OWNER_NOTIFY_EMAIL allow-list).
- **Shop access** is gated by the **DB feature-access system** (`lib/auth/feature-access.ts`, `feature_access` + `feature_allowlist` tables) — no env vars. Configured in-app at `/<lang>/admin/access`: per feature choose **Public** or **Restricted**; for restricted features add allowed emails (users must have signed up). Admins always have access. The `OWNER_NOTIFY_EMAIL` account is the first admin; more are granted at `/<lang>/admin/admins`.

## Store + admin (Phase 3 — built)

A **public catalog store** beside the sticker shop, plus an **owner admin**. **For store/order-system work, REQUIRED SUB-SKILL: use `sticker-shop`** (it now covers both order kinds). Orientation:
- **Catalog** = admin-managed Supabase `products` table (bilingual `*_he`/`*_en`, price in **agorot**, `options` JSONB, `status` draft/active/archived). Public storefront reads only `status='active'` via an **anon RLS SELECT policy** (catalog is public, unlike orders). Storefront: `/[lang]/store` (grid) → `/[lang]/store/[slug]` (detail + options) → **cart** (`components/store/cart-provider.tsx`, localStorage) → `/[lang]/store/cart` → `/[lang]/store/checkout` → `/[lang]/store/track/[token]`.
- **Order system generalized**: `orders.order_kind` (`stickers`|`store`, default stickers); store line items in a new `order_items` table (same RLS as `order_stickers`); the sticker price columns are nullable behind a kind-gated CHECK. Store orders are **create-at-confirm** (no draft) with a `client_request_id` idempotency key; they reuse the delivery schema + `PaymentProvider` + owner email + tracking, and **skip** all S3/packing/PDF. `OrderView` is now a discriminated union (`kind`). Cores in `lib/store/`; actions in `app/actions/store.ts`.
- **Product images** → a **public-read AWS S3 bucket** (`S3_PRODUCTS_BUCKET`), separate from the two private sticker buckets and written by the **same IAM user**. Admin uploads via a **presigned PUT** (browser → S3; bytes never go through the action); the storefront reads the public object URL (`productImagePublicUrl` in `lib/storage/s3.ts`, overridable via `S3_PRODUCTS_PUBLIC_URL` for a CDN). The resolved host is allow-listed in `next.config.ts`.
- **Admin gate = `isAdmin`/`isCurrentUserAdmin`** (`lib/auth/admin-access.ts`): an `OWNER_NOTIFY_EMAIL` env account (bootstrap superadmin, can't be locked out) **OR** a row in the `admins` table. Manage DB admins at **`/[lang]/admin/admins`** (`app/actions/admins.ts` — grant by email / revoke; `grantAdmin` looks the user up via the auth admin API, so they must have signed up first). All admin pages/actions funnel through `isCurrentUserAdmin()`.
- **Admin pages** (gated as above): product CRUD at `/[lang]/admin/products/*` (`app/actions/products.ts`; delete = soft archive) and an **orders dashboard** at `/[lang]/admin/orders` + `/[lang]/admin/orders/[id]` covering **both** order kinds — view + **advance order status** (incl. the new `seen` step) + a **manual payment-status control** (bridge until the real gateway) + receipt/file links (`app/actions/admin-orders.ts`). A shared `AdminNav` cross-links Products/Orders/Admins; an "Admin" link shows in the header user menu for admins.

## Launch Checklist (`TODO(client)`)

- Marketing: fill `lib/site-config.ts` (phone/email/whatsapp/socials/hours); set Vercel env (`NEXT_PUBLIC_SITE_URL` = the canonical origin, `RESEND_API_KEY`, `CONTACT_EMAIL`, `CONTACT_FROM`); replace placeholder images + client logos in `/public` then drop the cloudfront allowlist in `next.config.ts`; lawyer-review Terms/Privacy.
- Sticker shop: set sticker-shop env (`NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `AWS_REGION`, `S3_STICKERS_BUCKET`, `S3_STICKERS_PAID_BUCKET`, `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY`, `OWNER_NOTIFY_EMAIL`); create **both** S3 buckets (same region) with the IAM policy scoped to both; **apply the S3 CORS rule to the orders bucket** (PUT/GET from the site origin — see `docs/sticker-shop-setup.md` §3b; the paid bucket needs no CORS; the app IAM user can't set it); enable Supabase **Email + Google** auth providers + set **Site URL/Redirect URLs** to match `NEXT_PUBLIC_SITE_URL` (add `<origin>/**` to Redirect URLs, else Google sign-in bounces to localhost:3000); fill real pricing in `lib/stickers/sticker-config.ts` (`perSheetRate`/`setupFee` in **agorot** — until set, the UI shows "price confirmed before printing"); apply DB migrations to the project (`npm run db:push`); CONTACT_FROM must use the Resend-verified domain.
- Store/admin: reuses Supabase + `OWNER_NOTIFY_EMAIL` (bootstrap admin — additional admins are granted in-app at `/[lang]/admin/admins`) + Resend. **One new env var: `S3_PRODUCTS_BUCKET`** — a **public-read** S3 bucket for product images (public-read bucket policy + CORS PUT/GET; add it to the existing IAM user's policy; optional `S3_PRODUCTS_PUBLIC_URL` for a CDN). Apply migrations (`npm run db:push`) — creates the `products`/`order_items` tables (no storage provisioned). The storefront is **public**. Owner adds catalog items at `/[lang]/admin/products`; prices are in **agorot**.
- Feature access (sticker shop + store): **no env vars** — managed in-app at `/[lang]/admin/access` (`lib/auth/feature-access.ts`). Set each feature to **Public** or **Restricted**; for restricted, add allowed emails (users must have signed up). The `OWNER_NOTIFY_EMAIL` account is the first admin and always has access; grant more admins at `/[lang]/admin/admins`.

## Roadmap (architected-for, not built)

Real payment gateway (drop-in behind the `PaymentProvider` interface in `lib/payments/`); orphaned in-progress order cleanup (abandoned `confirmed_at IS NULL` rows — saved/editable drafts were removed); custom-upload (sticker-like) store products with bespoke pages; a real store-order receipt PDF; customer status-change emails; per-service deep pages. Keep new data/IO behind `lib/` + Server Actions as the seam. (Built since Phase 3: the store catalog, owner product CRUD, the admin order dashboard, and the DB feature-access system for sticker shop + store (`/admin/access`, `lib/auth/feature-access.ts`) — see "Store + admin" above.)

## Maintenance — keep this guide current

**This guide is part of the code. Whenever you change business facts, brand voice, design tokens, component conventions, the section recipe, or the roadmap, update this file in the SAME change** (and `lib/site-config.ts` / `AGENTS.md` / project memory if they overlap). A convention that drifts from the code is worse than none. (A skill can't self-update; if you want this enforced automatically, add a settings.json hook — text here is a reminder, not enforcement.)
