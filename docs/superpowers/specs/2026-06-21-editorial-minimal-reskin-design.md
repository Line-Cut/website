# Line Cut — Editorial Minimal Reskin (crtn.store-inspired)

**Date:** 2026-06-21
**Status:** Approved design — ready for implementation planning
**Scope:** Visual reskin of the marketing site (homepage + shared layout). No changes to behavior, content data, i18n/RTL structure, sticker shop, or auth.

## 1. Goal

Restyle the Line Cut marketing site to feel like [crtn.store](https://crtn.store/) — clean white minimalism, bold sans-serif headlines, generous whitespace, and an image-driven card portfolio — while keeping Line Cut's brand identity (the brick-red accent) and its Hebrew-first bilingual RTL/LTR architecture.

Chosen direction: **A — Editorial Minimal** (the truest read of crtn.store: stark white, large bold grotesk headlines, red used only as a single accent). Rejected alternatives: B "Bold Industrial" (too punchy/branded) and C "Soft Minimal" (kept too much warmth).

## 2. Non-goals / constraints

- **No re-architecture.** Same sections, same order, same copy, same dictionaries. This is tokens + per-section restyle.
- **Preserve i18n/RTL.** No changes to `app/[lang]`, `proxy.ts`, dictionary loading, the parity test, or logical-CSS conventions (see `rtl-bilingual-nextjs`). All new CSS must stay logical (start/end, not left/right).
- **Do not touch** the sticker shop (`/[lang]/stickers`, `lib/stickers`, `lib/orders`), auth, Supabase/S3, or Server Actions.
- **Accessibility holds:** body ≥16px, text contrast ≥4.5:1, visible focus rings, reduced-motion respected.
- Keep the component conventions from the project skill: kebab-case files, named exports, `<Container>`, `<Reveal>`, `SECTION_IDS`, tokens (never raw Tailwind colors), brand icons from `components/ui/social-icons.tsx`.

## 3. Foundation — design tokens

Tokens live in `app/globals.css` as Tailwind v4 `@theme` colors. Update values; keep token **names** stable so components don't churn.

| Token | New value | Was | Use |
|---|---|---|---|
| `paper` | `#FFFFFF` | warm cream | page background |
| `paper-2` | `#FAFAFA` | warm cream-2 | alternating section background |
| `ink` | `#141414` | warm charcoal | primary text |
| `ink-deep` (dark sections) | `#0E0E0E` | warm ink | dark-section background (`bg-ink` usages) |
| `muted` | `#5B5B5B` | `#5D5851` | secondary text (AA on white) |
| `line` | `#ECECEC` | warm hairline | hairlines/borders |
| `accent` / `accent-600` | `#B8281F` / hover | unchanged | CTAs + the single accent, unchanged |

Notes:
- Dark sections switch from warm ink to **true black `#0E0E0E`** with `text-paper` / `text-paper/70` body.
- Verify `muted #5B5B5B` on `#FFF` meets AA (it does, ~6.5:1).

### Typography

- **Display/headings:** replace **Frank Ruhl Libre** with **Heebo** (Hebrew+Latin grotesk), weights 400/600/700/800/900, via `next/font/google`. Update `--font-frank` usage → a `font-display` mapped to Heebo (keep the `font-display` class name; repoint the font). Subsets `["hebrew","latin"]`.
- **Body:** **Assistant** stays (`font-sans`), unchanged.
- Type scale (logical, responsive with `clamp`):
  - Hero `h1`: Heebo 900, `clamp(40px, 8vw, 88px)`, line-height ~0.96, letter-spacing -0.03em.
  - Section `h2`: Heebo 800, ~36px.
  - Card/`h3`: Heebo 700, ~22px.
  - Body: Assistant 400, 16–18px, line-height 1.5.
  - Label: Heebo 800, 11px, uppercase, letter-spacing 0.2em, in `accent`.

## 4. Layout — section by section

Order unchanged: Header → Hero → ValueProps → Services → Why → Process → Gallery(→Portfolio) → Studio → Clients → Faq → Contact → Footer.

- **Header** (`components/layout/header.tsx`): thin sticky bar, wordmark + text links + one red "התחילו פרויקט" button; hairline (`border-line`) appears on scroll.
- **Hero** (`components/sections/hero.tsx`): oversized Heebo headline, large whitespace, red primary CTA + ghost secondary ("צרו קשר →"). Remove decorative card chrome. Primary CTA uses `whatsappLink()`.
- **ValueProps** → thin **stat/statement row**: 3 short statements separated by hairlines, no boxes.
- **Services** (`components/sections/services.tsx`): 5 services as clean tiles in a responsive grid — label + one line, `border-line` borders, hover lift; SVG lucide icons (stroke, no fills). Icons stay sourced from `SERVICE_ICONS` in `lib/content.ts`.
- **Why / Process / Studio:** editorial text blocks; Process as big numbered steps (01–05) with hairline separators; Studio = one wide image + short text.
- **Gallery → Portfolio** (the only structural change): rename/restyle to a **project-card grid** that becomes a **horizontal-scroll showcase** on smaller widths; cards hold project photos with a caption and a subtle hover zoom (transform/opacity only). Build for **"some images now, more later"**: a typed list of projects (image + caption keys) with a few real photos in `/public` and tasteful neutral placeholders for the rest, so adding a project = add an entry + drop a file. Keep `SECTION_IDS` anchor stable.
- **Clients** (`components/sections/clients.tsx` + `components/ui/logos3.tsx`): keep the auto-scroll logo strip; retune dark bg to `#0E0E0E`. (Logos already wired in `lib/content.ts`.)
- **FAQ:** minimal accordion — hairline rows, Heebo questions, no card chrome.
- **Contact** (`components/sections/contact.tsx`): big "התחילו פרויקט" headline, clean form on white, red submit + WhatsApp link (existing Zod + Server Action flow unchanged). Footer keeps the real contact details/socials already in `lib/site-config.ts`.

## 5. Motion

Restrained, reusing the existing `<Reveal>` (framer-motion, already honors `prefers-reduced-motion`):
- Tune `<Reveal>` quieter (subtle fade + small rise).
- Portfolio cards: image zoom on hover (`transform: scale`), horizontal-scroll showcase.
- Header: hairline fade-in on scroll.
- Durations 150–300ms, ease-out (ease-in for exits). No parallax or decorative motion.

## 6. Affected files (anticipated)

- `app/globals.css` — token values + type scale.
- `app/[lang]/layout.tsx` — swap display font to Heebo (`next/font`).
- `components/layout/{header,footer}.tsx`.
- `components/sections/{hero,value-props,services,why,process,gallery→portfolio,studio,clients,faq,contact}.tsx`.
- `components/ui/logos3.tsx`, `components/motion/reveal.tsx` (tuning only).
- `lib/content.ts` — Portfolio project entries + `SECTION_IDS` (rename gallery→portfolio if desired; keep dictionaries in parity).
- Dictionaries `app/[lang]/dictionaries/{he,en}.json` — only if section keys are renamed (must stay in parity; the parity test must pass).
- `/public/` — a few real project photos + placeholders.
- Update the `linecut-website` skill (`design system` table + section recipe) and `AGENTS.md`/memory if tokens/fonts/conventions change — same change.

## 7. Verification

- `npm test` (dictionary parity + existing unit tests pass).
- `npm run typecheck && npm run build`.
- Load `/he` and `/en`: confirm `scrollWidth === clientWidth` (no RTL overflow), headings render in Heebo, dark sections true-black, brick-red only on accents/CTAs.
- Reduced-motion: animations minimized.
- Spot-check contrast on `muted`/`paper` and dark sections.

## 8. Open items

- Real project photos to replace placeholders (client to provide over time).
- Decide whether to rename the `gallery` section key to `portfolio` (cosmetic; requires parity-safe dictionary rename) or keep `gallery` internally and just restyle. Default: **keep the key, restyle only**, to minimize churn.
