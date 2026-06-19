# Line Cut Ltd. — Landing Page (Phase 1) — Design Spec

**Date:** 2026-06-20
**Status:** Approved
**Author:** brainstorming session (yuvala@inabit.com)

## Overview

A professional, bilingual (Hebrew-first, English option) marketing landing page for
**Line Cut Ltd.**, a digital printing, cutting, and finishing production house in Holon, Israel.

This spec covers **Phase 1 only: the landing page.** Later phases (user auth, a WhatsApp/custom
sticker shop with cart, payments, and delivery, DB-backed order galleries, an owner product shop,
and per-service deep pages) are explicitly out of scope here, but the architecture must let them
attach later without a rewrite.

### Positioning & tone
Line Cut is a **reliable, precise, fast, technically capable production partner** — not a cheap
copy shop. Tone: professional, clear, direct, technical-but-approachable, confident without being
salesy. Main message: **"Digital printing, cutting, and finishing — produced accurately from your file."**

Avoid emphasizing: cheap pricing, internal production systems/workflow tools, machine model names,
operational problems, internal policies.

## Company facts (sourced)
- **Name:** Line Cut Ltd. (ליין קאט בע"מ)
- **Address:** HaSadna 8, Holon, Israel (הסדנא 8, חולון)
- **Business ID:** 516741998
- **Field:** Wide-format digital printing, precision cutting, signage, stickers, exhibition
  production, museum graphics, rigid-material printing, custom production.

## Confirmed decisions
- **Phase 1 scope:** Landing page only.
- **Visual direction:** Warm studio / craft — paper & ink tones, subtle texture, hands-on yet precise.
- **Brand:** Logo provided at `public/F_LINE_CUT_LOGO.svg`. Colors derived from it (below).
- **Photos:** User will provide real project photos; placeholders used until then.
- **Contact form:** Email (via Resend) **plus** a prominent WhatsApp deep-link button.
- **Backend (future):** Supabase (Postgres + auth + storage). Not used in Phase 1.
- **Deployment:** Vercel.
- **Contact details:** Placeholders in `lib/site-config.ts` for the user to fill before launch
  (phone, email, WhatsApp number, Instagram, Facebook, opening hours). Address + business ID known.

## 1. Technical foundations

| Concern | Decision |
| --- | --- |
| Framework | Next.js 16 (App Router), React 19 — **already scaffolded** |
| Styling | Tailwind v4 (`@theme` tokens in `globals.css`) |
| Animation | framer-motion (already present) |
| Hosting | Vercel |
| i18n | Native `app/[lang]` + JSON dictionaries; `proxy.ts` for locale detection/redirect |
| Email | Resend (Server Action) |
| Future backend | Supabase, kept behind a `lib/` boundary |

### i18n / RTL
- Locales: `he` (default), `en`. All routes live under `app/[lang]/…`.
- `proxy.ts` redirects locale-less paths to a locale (Hebrew default; honor `Accept-Language` for `en`).
- Root layout sets `<html lang={lang} dir={lang === 'he' ? 'rtl' : 'ltr'}>`.
- **All copy** in `app/[lang]/dictionaries/he.json` + `en.json`, loaded server-side via a
  `getDictionary(locale)` helper (per the bundled Next i18n guide). Type-narrowed with `hasLocale`.
- Components use **logical CSS** (`ps-/pe-`, `ms-/me-`, `start/end`, `text-start`) so one component
  tree renders correctly in both RTL and LTR. No mirrored duplicate components.
- Note (this modified Next): middleware file is `proxy.ts`; `PageProps<'/[lang]'>` and
  `LayoutProps<'/[lang]'>` global type helpers are available.

### Contact form flow
- A React form (client component) posts to a **Server Action**.
- The action validates input, then sends an email to the configured business address via **Resend**
  (`RESEND_API_KEY` env var). Returns success/error to the form for inline feedback.
- A separate, always-available **WhatsApp button** builds a `https://wa.me/<number>?text=…` deep link
  from `site-config`.
- No database write in Phase 1 (Supabase can be added to the same action later).

### Environment variables (Vercel)
- `RESEND_API_KEY` — email sending.
- `CONTACT_EMAIL` — destination inbox (can also live in `site-config`).
- Public contact details (WhatsApp, socials) live in `lib/site-config.ts`, not env.

## 2. Design system

### Color (from the logo)
- `--accent`: **`#b8281f`** (brick red — the registration-mark square; CTAs, links, focus).
- `--ink`: warm charcoal (derived deepening of the wordmark gray) — primary text.
- `--muted`: **`#7e7d7b`** (warm gray — secondary text, captions).
- `--paper`: warm cream background; `--paper-2` a slightly deeper tone for alternating sections.
- Dark "ink" sections: charcoal background using the **white logo variant** for contrast.
- Defined as Tailwind v4 `@theme` tokens. Phase 1 commits to a single warm **light** theme
  (the starter's `prefers-color-scheme: dark` block is removed); no dark-mode toggle.

### Typography (Hebrew + Latin, via `next/font`)
- **Headlines:** Frank Ruhl Libre (Hebrew + Latin serif — warmth, editorial precision).
- **Body / UI:** Assistant (or Heebo) — clean Hebrew + Latin sans.
- Exposed as `--font-display` / `--font-sans` CSS variables, wired into Tailwind theme.

### Texture, motif, motion
- Subtle paper grain; thin hairline rules; discreet **cut-line / crop-mark** accents echoing the name.
- framer-motion: gentle scroll-reveal on sections; continuous marquee for the clients strip.
- Respect `prefers-reduced-motion`.

### Component structure (shadcn-compatible)
- `lib/utils.ts` → `cn()` (clsx + tailwind-merge).
- `components/ui/` → primitives: `button`, `card`, `carousel`, `accordion`, plus user-provided blocks
  (e.g. `logos3`). These match the structure the user's external component source expects.
- `components/sections/` → page sections (Hero, Services, Process, …).
- `components/layout/` → Header, Footer, LanguageToggle.
- New deps expected: `clsx`, `tailwind-merge`, `lucide-react`, `class-variance-authority`,
  `@radix-ui/react-slot`, `embla-carousel-react`, `embla-carousel-auto-scroll` (carousel/marquee),
  and an accordion primitive (Radix). `resend` for email.

## 3. Page composition (single long RTL page with anchor nav)

1. **Header** — logo; anchor nav (Services, Why us, Process, Work, Clients, FAQ, Contact);
   **HE/EN toggle**; primary CTA (Start a project / WhatsApp). Sticky, condenses on scroll.
2. **Hero** — headline *"הדפסה דיגיטלית, חיתוך וגימור — מיוצר במדויק מהקובץ שלך"*; subcopy
   (the approved opening paragraph, Hebrew + EN); CTAs (WhatsApp + scroll-to-contact); hero imagery.
3. **Value props** — the seven short value propositions as a compact strip.
4. **Services** — 5 cards: Stickers & Roll Printing · Letter Cutting & Signage · Printing on Rigid
   Materials · Exhibitions, Museums & Galleries · Custom Production. Each: icon, short copy, a few
   bullet examples. Cards are **link-ready** to become full pages in Phase 2.
5. **Why Line Cut** — key strengths (fast turnaround, organized process, technical file review,
   print+cut+finish under one roof, complex-job experience, accuracy/reliability).
6. **Work process** — file → technical review → production → finishing → pickup / delivery / install.
7. **Projects / Gallery** — filterable image grid; placeholders now, real photos later. Built so a
   later phase can render DB-backed user order galleries here.
8. **From the studio** — showcase of the owner's own creations; placeholder now, expandable into a
   product shop later.
9. **Clients** — logo marquee (the user's `Logos3` carousel, recolored to the palette).
10. **FAQ** — accordion.
11. **Contact** — address, business ID, phone, email, opening hours, Instagram/Facebook; inquiry
    form (Resend Server Action) + WhatsApp button. Optional embedded map.
12. **Footer** — logo, nav, **Terms & Privacy** links, socials, copyright + business ID.

### Legal pages
- `app/[lang]/terms` and `app/[lang]/privacy` — real routes with standard boilerplate structure,
  clearly marked **"review with a lawyer before launch."** Required for a business that sells.

## 4. Content
- Primary voice **Hebrew**, with a faithful **English** translation, both in the approved tone.
- All strings in `he.json` / `en.json` dictionaries — no hard-coded copy in components.
- Source copy (homepage opening, value props, service lists) taken from the provided brief.

## 5. Out of scope (future phases, architected-for)
- Auth (Google + email/password) via Supabase.
- WhatsApp/custom sticker builder: add/remove stickers, cart, payment, delivery address, send-to-print.
- DB-backed order gallery (per-user) and owner product shop with checkout.
- Per-service deep pages (Stickers, Signage, Exhibitions, File Preparation, Projects).

## Success criteria
- Visiting `/` redirects to `/he`; the page renders Hebrew, RTL, correctly.
- `/en` renders the full page in English, LTR, with all sections translated.
- Language toggle switches locale while preserving the current section/anchor.
- All 12 sections render responsively (mobile → desktop) with the warm-studio look and the
  logo-derived palette.
- Contact form submits via Server Action and emails the configured address (Resend); WhatsApp
  button opens a prefilled chat.
- Placeholders for photos and contact details are obvious and centralized for easy replacement.
- Builds clean (`next build`) and deploys on Vercel.
- No backend dependency in Phase 1; `lib/` boundary leaves room for Supabase.
