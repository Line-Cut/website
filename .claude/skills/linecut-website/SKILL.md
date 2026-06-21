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
- Contact details, socials, hours, and the production domain live in **`lib/site-config.ts`** (placeholders marked `TODO(client)`) — never hard-code them in components.

## Voice & Tone

Professional, clear, direct, technically capable, **confident without being salesy**. Position as a **reliable, precise, fast production partner — NOT a cheap print shop.**
**Avoid:** cheap-pricing language, machine model names, internal systems/workflow tools, operational problems. Main message: *"Digital printing, cutting and finishing — produced accurately from your file."*

## Design System (warm studio / craft)

Tokens are defined in `app/globals.css` as Tailwind v4 `@theme` colors. **Use the tokens, never raw Tailwind colors like `green-50` or `gray-600`:**

| Token | Use |
|---|---|
| `bg-paper` / `bg-paper-2` | page / alternating section background (warm cream) |
| `text-ink` | primary text (warm charcoal) |
| `text-muted` (`#5d5851`) | secondary text — AA-safe on paper; **not** the logo gray `#7e7d7b` |
| `text-accent` / `bg-accent` (`#b8281f`) | brick-red accent, **CTAs and small accents only** |
| `accent-600` | accent hover |
| `border-line` | hairlines |
| dark sections | `bg-ink text-paper` (with `text-paper/70` for body) |

Fonts: `font-display` = Frank Ruhl Libre (headings), `font-sans` = Assistant (body) — both Hebrew+Latin, via `next/font`. Logo: `public/F_LINE_CUT_LOGO.svg`.

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

The `/[lang]/stickers` flow: upload WhatsApp `.webp` stickers → A4 preview + live price → checkout (delivery) → place order (payment deferred) → guest tracking link / account history. Architecture:
- **Supabase** = Postgres (orders, order_stickers) + Auth (Google + email/password). **AWS S3** = file storage, key scheme `{clientKey}/{orderId}/{stickerId}.webp` (`clientKey` = `u_<userId>` or `g_<guestToken>`).
- **Uploads go browser→S3 direct** via presigned PUT URLs (Server Actions cap at ~1MB) — never POST files through an action.
- Pure pricing/packing/validation in `lib/stickers/`; DI cores in `lib/orders/` (`create-draft`, `confirm-order`, `order-view`) with thin `"use server"` wrappers in `app/actions/stickers.ts`. Secrets only in server-only modules (`lib/supabase/admin.ts`, `lib/storage/s3.ts`); browser uses `lib/supabase/client.ts` + presigned URLs.
- **DB migrations** = Supabase CLI: files in `supabase/migrations/<ts>_name.sql`, `npm run db:push` / `db:new`. Vercel does NOT run migrations — they apply via CI/CLI (see `supabase/migrations/README.md`). The CLI is `npx`-only (not a dep) to keep Vercel installs lean.
- RLS is default-deny; guest reads go through the admin client filtered by `guest_token` (no anon read policy). Owner files route is gated by `isOwnerEmail` (OWNER_NOTIFY_EMAIL allow-list).

## Launch Checklist (`TODO(client)`)

- Marketing: fill `lib/site-config.ts` (phone/email/whatsapp/socials/hours + `url`); set Vercel env (`RESEND_API_KEY`, `CONTACT_EMAIL`, `CONTACT_FROM`); replace placeholder images + client logos in `/public` then drop the cloudfront allowlist in `next.config.ts`; lawyer-review Terms/Privacy.
- Sticker shop: set sticker-shop env (`NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `AWS_REGION`, `S3_STICKERS_BUCKET`, `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY`, `OWNER_NOTIFY_EMAIL`); **apply the S3 bucket CORS rule** (PUT/GET from the site origin — see `docs/sticker-shop-setup.md` §3b; the app IAM user can't set it); enable Supabase **Email + Google** auth providers + Site URL/Redirect URLs; fill real pricing in `lib/stickers/sticker-config.ts` (`perSheetRate`/`setupFee` in **agorot** — until set, the UI shows "price confirmed before printing"); apply DB migrations to the project (`npm run db:push`); CONTACT_FROM must use the Resend-verified domain.

## Roadmap (architected-for, not built)

Real payment gateway (drop-in behind the `PaymentProvider` interface in `lib/payments/`); admin order dashboard; orphaned-draft cleanup cron (drafts = `confirmed_at IS NULL`); "add as a store product" catalog; owner product shop; per-service deep pages. Keep new data/IO behind `lib/` + Server Actions as the seam.

## Maintenance — keep this guide current

**This guide is part of the code. Whenever you change business facts, brand voice, design tokens, component conventions, the section recipe, or the roadmap, update this file in the SAME change** (and `lib/site-config.ts` / `AGENTS.md` / project memory if they overlap). A convention that drifts from the code is worse than none. (A skill can't self-update; if you want this enforced automatically, add a settings.json hook — text here is a reminder, not enforcement.)
