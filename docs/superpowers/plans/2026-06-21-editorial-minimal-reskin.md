# Editorial Minimal Reskin Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Reskin the Line Cut marketing site to a crtn.store-inspired "editorial minimal" look — white base, bold Heebo headlines, brick-red as the only accent, and the gallery turned into a horizontal-scroll card portfolio — without changing content, copy, i18n/RTL structure, or the sticker shop.

**Architecture:** The codebase is token-driven (Tailwind v4 `@theme` colors in `app/globals.css`, fonts via `next/font` in `app/[lang]/layout.tsx`). Most of the reskin is achieved by changing token *values* and the display font, which propagates everywhere automatically. The remaining tasks restyle individual sections' structure (hero chrome, value-prop row, service tiles, portfolio scroll, dark-section black) and tune motion.

**Tech Stack:** Next.js 16 App Router, React 19, Tailwind CSS v4, framer-motion, next/font (Google: Heebo + Assistant), vitest + @testing-library/react.

## Global Constraints

- **Read the relevant guide in `node_modules/next/dist/docs/` before writing code** (per `AGENTS.md`) — especially for `next/font` in Task 2. This Next.js may differ from training data.
- **Use design tokens, never raw Tailwind colors** (`bg-paper`, `text-ink`, `text-muted`, `text-accent`, `border-line`) — no `gray-600` / `green-50` / raw hex in components.
- **Logical CSS only** (`start`/`end`, `ps-`/`pe-`, `text-balance`) — never `left`/`right`. The site is Hebrew-first RTL + English LTR.
- **Dictionary parity must hold:** `app/[lang]/dictionaries/he.json` and `en.json` must keep identical shape; `npm test` includes the parity test. Do **not** add/remove dictionary keys in this plan (all changes reuse existing keys).
- **Conventions:** kebab-case files, named exports, wrap section width in `<Container>`, wrap content in `<Reveal>`, anchor ids from `SECTION_IDS`, brand icons from `components/ui/social-icons.tsx`.
- **Commits on this machine** need an inline identity and a nulled broken global config. Every commit step uses:
  ```bash
  export GIT_CONFIG_GLOBAL=/dev/null
  git -c user.name="YuvalAltunInabit" -c user.email="yuvala@inabit.com" commit -m "<msg>

  Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
  ```
  Work happens on branch `reskin-editorial-minimal` (already created).
- **Per-task verification baseline:** `npm run typecheck` and `npm test` must pass; a dev server is running on http://localhost:3000 — eyeball `/he` (RTL) and `/en` (LTR) after each visual task and confirm `document.documentElement.scrollWidth === clientWidth` (no horizontal overflow).
- Run a full `npm run build` once at the end (Task 11), not every task.

---

### Task 1: Foundation color tokens

**Files:**
- Modify: `app/globals.css:3-14` (token values), and `:35-54` (warm decorative classes)

**Interfaces:**
- Produces: token values consumed by every component — `--color-paper #FFFFFF`, `--color-paper-2 #FAFAFA`, `--color-ink #141414`, `--color-ink-deep #0E0E0E` (NEW), `--color-muted #5B5B5B`, `--color-line #ECECEC`, `--color-accent`/`--color-accent-600` unchanged. New utility color `ink-deep` becomes available as `bg-ink-deep` / `text-ink-deep`.

- [ ] **Step 1: Update the `@theme` color block**

In `app/globals.css`, replace the color custom properties (lines 4-10) with:

```css
  --color-paper: #ffffff;
  --color-paper-2: #fafafa;
  --color-ink: #141414;
  --color-ink-deep: #0e0e0e; /* true-black background for dark sections */
  --color-muted: #5b5b5b; /* AA ≥4.5:1 on white */
  --color-line: #ececec;
  --color-accent: #b8281f;
  --color-accent-600: #9e2019;
```

- [ ] **Step 2: Remove the warm paper grain (editorial look is clean)**

Delete the `.bg-grain` rule (lines ~36-42 in `app/globals.css`). Confirm where it's used first:

Run: `grep -rn "bg-grain" components app`
Expected: only `components/sections/hero.tsx` references it (removed in Task 3). Delete the CSS rule now; the class on hero is removed in Task 3.

- [ ] **Step 3: Keep `.cut-rule` but neutralize the warm look later**

Leave `.cut-rule` defined (it reads `--color-line`, now neutral). Its only usage is removed in Task 3.

- [ ] **Step 4: Verify build-time CSS compiles**

Run: `npm run typecheck`
Expected: PASS (CSS isn't typechecked, but this catches any token name referenced in TS — none expected).

Reload http://localhost:3000/he — background is now white, text near-black. Dark sections (Why, Clients) still show old warm ink until Task 7/8.

- [ ] **Step 5: Commit**

```bash
export GIT_CONFIG_GLOBAL=/dev/null
git add app/globals.css
git -c user.name="YuvalAltunInabit" -c user.email="yuvala@inabit.com" commit -m "style(tokens): white base + true-black dark sections, neutral grays

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 2: Swap display font to Heebo

**Files:**
- Modify: `app/[lang]/layout.tsx:2,11-15`
- Reference: `node_modules/next/dist/docs/` (next/font)

**Interfaces:**
- Consumes: `--font-display: var(--font-frank)` mapping in `globals.css` (unchanged — we keep the `--font-frank` CSS variable name, only repoint the font, so `font-display` everywhere now renders Heebo).
- Produces: Heebo loaded with weights 400–900 under CSS var `--font-frank`.

- [ ] **Step 1: Read the next/font guide**

Run: `ls node_modules/next/dist/docs/ && grep -rl "next/font" node_modules/next/dist/docs/ | head`
Read the matching font doc to confirm the `next/font/google` API shape for this Next version before editing.

- [ ] **Step 2: Replace the import and loader**

In `app/[lang]/layout.tsx`, change line 2:

```ts
import { Heebo, Assistant } from "next/font/google";
```

Replace the `display` loader (lines 11-15) with:

```ts
const display = Heebo({
  subsets: ["hebrew", "latin"],
  weight: ["400", "500", "600", "700", "800", "900"],
  variable: "--font-frank",
});
```

(Leave the `Assistant` loader and the `${display.variable} ${sans.variable}` usage untouched.)

- [ ] **Step 3: Verify it builds and renders Heebo**

Run: `npm run typecheck`
Expected: PASS.

Reload http://localhost:3000/he — all headings (hero, section h2s) now render in Heebo (bold geometric sans) instead of the serif. Check `/en` too.

- [ ] **Step 4: Commit**

```bash
export GIT_CONFIG_GLOBAL=/dev/null
git add app/[lang]/layout.tsx
git -c user.name="YuvalAltunInabit" -c user.email="yuvala@inabit.com" commit -m "style(type): use Heebo for display, replacing Frank Ruhl Libre

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 3: Hero — strip decorative chrome, scale up the headline

**Files:**
- Modify: `components/sections/hero.tsx`
- Test: `components/sections/hero.test.tsx` (already passing; verify still green)

**Interfaces:**
- Consumes: `dict.hero` (unchanged shape: `eyebrow, title, subtitle, ctaPrimary, ctaSecondary, ctaMessage, imageAlt`), `whatsappLink()`, `SECTION_IDS`.

- [ ] **Step 1: Replace the hero section body**

Replace the `<section>` in `components/sections/hero.tsx` (remove `bg-grain` and the `cut-rule`, sharpen the image, enlarge the headline) with:

```tsx
    <section id={SECTION_IDS.hero} className="relative overflow-hidden">
      <Container className="grid items-center gap-12 py-20 lg:grid-cols-2 lg:py-28">
        <Reveal className="flex flex-col gap-6">
          <p className="text-xs font-extrabold uppercase tracking-[0.2em] text-accent">
            {dict.eyebrow}
          </p>
          <h1 className="font-display text-5xl font-black leading-[0.96] tracking-tight text-balance sm:text-6xl lg:text-7xl">
            {dict.title}
          </h1>
          <p className="max-w-xl text-lg leading-relaxed text-muted">
            {dict.subtitle}
          </p>
          <div className="flex flex-wrap gap-4">
            <Button asChild size="lg">
              <a href={whatsappLink(dict.ctaMessage)} target="_blank" rel="noopener noreferrer">
                {dict.ctaPrimary}
              </a>
            </Button>
            <Button asChild size="lg" variant="ghost">
              <a href={`#${SECTION_IDS.contact}`}>{dict.ctaSecondary} →</a>
            </Button>
          </div>
        </Reveal>

        <Reveal delay={0.15} className="relative">
          {/* TODO(client): replace with a real hero photo at /public/hero.jpg */}
          <div className="relative aspect-[4/3] overflow-hidden rounded-lg border border-line">
            <Image
              src="https://images.unsplash.com/photo-1581092580497-e0d23cbdf1dc?auto=format&fit=crop&w=1200&q=80"
              alt={dict.imageAlt}
              fill
              sizes="(max-width: 1024px) 100vw, 50vw"
              className="object-cover"
              priority
            />
          </div>
        </Reveal>
      </Container>
    </section>
```

- [ ] **Step 2: Run the hero test**

Run: `npm test -- hero`
Expected: PASS (heading + WhatsApp link assertions still hold).

- [ ] **Step 3: Visual check**

Reload `/he` and `/en`: oversized headline, no grain, no dashed cut-rule, crisp image. Confirm no horizontal overflow.

- [ ] **Step 4: Commit**

```bash
export GIT_CONFIG_GLOBAL=/dev/null
git add components/sections/hero.tsx
git -c user.name="YuvalAltunInabit" -c user.email="yuvala@inabit.com" commit -m "style(hero): editorial hero — bigger Heebo headline, drop grain/cut-rule

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 4: Value props → thin hairline statement row

**Files:**
- Modify: `components/sections/value-props.tsx`

**Interfaces:**
- Consumes: `VALUE_PROP_KEYS` (7 keys), `dict.valueProps.items[key]` (unchanged).

- [ ] **Step 1: Replace the list with hairline-separated statements**

Replace the `<ul>` block in `components/sections/value-props.tsx` (drop the `Check` icon import and boxes) with a quieter editorial row. Full file:

```tsx
import { Container } from "@/components/layout/container";
import { Reveal } from "@/components/motion/reveal";
import { VALUE_PROP_KEYS } from "@/lib/content";
import type { Dictionary } from "@/lib/dictionary";

export function ValueProps({ dict }: { dict: Dictionary["valueProps"] }) {
  return (
    <section className="border-y border-line py-10">
      <Container>
        <ul className="grid gap-x-10 gap-y-3 sm:grid-cols-2 lg:grid-cols-3">
          {VALUE_PROP_KEYS.map((key, i) => (
            <Reveal key={key} delay={i * 0.04}>
              <li className="flex items-baseline gap-3 border-b border-line/70 pb-3 text-ink/90">
                <span className="font-display text-sm font-extrabold text-accent">
                  {String(i + 1).padStart(2, "0")}
                </span>
                <span>{dict.items[key]}</span>
              </li>
            </Reveal>
          ))}
        </ul>
      </Container>
    </section>
  );
}
```

- [ ] **Step 2: Verify**

Run: `npm run typecheck`
Expected: PASS (the `Check`/lucide import is gone; no unused-import error).

Reload `/he` — value props read as a numbered hairline row, no boxes/tints.

- [ ] **Step 3: Commit**

```bash
export GIT_CONFIG_GLOBAL=/dev/null
git add components/sections/value-props.tsx
git -c user.name="YuvalAltunInabit" -c user.email="yuvala@inabit.com" commit -m "style(value-props): hairline numbered row, drop check boxes

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 5: Services → minimal hairline tiles

**Files:**
- Modify: `components/sections/services.tsx`

**Interfaces:**
- Consumes: `SERVICE_KEYS` (5), `SERVICE_ICONS`, `dict.services` (`heading, intro, items[key].{title,description,examples}`).
- Note: stops using `components/ui/card` (no dict/data change).

- [ ] **Step 1: Replace the Card grid with hairline tiles**

Replace the file body of `components/sections/services.tsx` with (drop the `Card*` import; icon becomes a plain accent stroke, tiles use `border-line` + hover lift):

```tsx
import { Container } from "@/components/layout/container";
import { Reveal } from "@/components/motion/reveal";
import { SERVICE_KEYS, SERVICE_ICONS, SECTION_IDS } from "@/lib/content";
import type { Dictionary } from "@/lib/dictionary";

export function Services({ dict }: { dict: Dictionary["services"] }) {
  return (
    <section id={SECTION_IDS.services} className="py-20">
      <Container>
        <Reveal className="mb-12 max-w-2xl">
          <h2 className="font-display text-3xl font-extrabold sm:text-4xl">{dict.heading}</h2>
          <p className="mt-4 text-lg text-muted">{dict.intro}</p>
        </Reveal>
        <div className="grid gap-px overflow-hidden rounded-lg border border-line bg-line sm:grid-cols-2 lg:grid-cols-3">
          {SERVICE_KEYS.map((key, i) => {
            const Icon = SERVICE_ICONS[key];
            const item = dict.items[key];
            return (
              <Reveal key={key} delay={i * 0.05}>
                <div className="flex h-full flex-col gap-3 bg-paper p-6 transition-colors hover:bg-paper-2">
                  <Icon className="h-6 w-6 text-accent" strokeWidth={1.75} />
                  <h3 className="font-display text-xl font-bold">{item.title}</h3>
                  <p className="text-muted">{item.description}</p>
                  <ul className="mt-1 flex flex-col gap-1.5 text-sm text-ink/80">
                    {item.examples.map((ex) => (
                      <li key={ex} className="flex items-center gap-2">
                        <span className="h-1 w-1 rounded-full bg-accent" />
                        {ex}
                      </li>
                    ))}
                  </ul>
                </div>
              </Reveal>
            );
          })}
        </div>
      </Container>
    </section>
  );
}
```

(The `gap-px` on a `bg-line` parent draws crisp hairline gridlines between tiles — a clean editorial device.)

- [ ] **Step 2: Verify**

Run: `npm run typecheck`
Expected: PASS.

Reload `/he` — 5 service tiles with hairline gridlines, plain accent icons, no filled chips/shadows.

- [ ] **Step 3: Commit**

```bash
export GIT_CONFIG_GLOBAL=/dev/null
git add components/sections/services.tsx
git -c user.name="YuvalAltunInabit" -c user.email="yuvala@inabit.com" commit -m "style(services): minimal hairline-grid tiles, plain stroke icons

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 6: Gallery → Portfolio (card grid + horizontal scroll, drop-in project data)

**Files:**
- Modify: `lib/content.ts` (add `Project` type + `PROJECTS`)
- Modify: `components/sections/gallery.tsx`
- Create: `components/sections/gallery.test.tsx`

**Interfaces:**
- Consumes: `dict.gallery` (`heading, intro, imageAltPrefix` — unchanged).
- Produces: `export type Project = { src: string }` and `export const PROJECTS: readonly Project[]` in `lib/content.ts`. Adding a real photo later = replace a `src` with `/work/<file>` and drop the file in `/public/work` (no other change).

- [ ] **Step 1: Write the failing test**

Create `components/sections/gallery.test.tsx`:

```tsx
import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { Gallery } from "@/components/sections/gallery";
import { PROJECTS } from "@/lib/content";

vi.mock("next/image", () => ({
  default: (props: Record<string, unknown>) => {
    const { alt, src } = props as { alt: string; src: string };
    // eslint-disable-next-line @next/next/no-img-element
    return <img alt={alt} src={src} />;
  },
}));

const dict = { heading: "Work", intro: "intro", imageAltPrefix: "Project" };

describe("Gallery / Portfolio", () => {
  it("renders one tile per project in PROJECTS", () => {
    render(<Gallery dict={dict} />);
    expect(screen.getAllByRole("img")).toHaveLength(PROJECTS.length);
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npm test -- gallery`
Expected: FAIL — `PROJECTS` is not exported from `lib/content.ts` yet.

- [ ] **Step 3: Add the `PROJECTS` data to `lib/content.ts`**

Append to `lib/content.ts` (after the `CLIENTS` block):

```ts
// Portfolio projects shown in the work grid, in display order. To add a real
// project: replace `src` with "/work/<file>.jpg" and drop the file in /public/work.
// Until real photos arrive these point at neutral placeholders.
export type Project = { src: string };

export const PROJECTS: readonly Project[] = [
  { src: "https://images.unsplash.com/photo-1558655146-9f40138edfeb?auto=format&fit=crop&w=900&q=80" },
  { src: "https://images.unsplash.com/photo-1607082348824-0a96f2a4b9da?auto=format&fit=crop&w=900&q=80" },
  { src: "https://images.unsplash.com/photo-1561070791-2526d30994b5?auto=format&fit=crop&w=900&q=80" },
  { src: "https://images.unsplash.com/photo-1581291518857-4e27b48ff24e?auto=format&fit=crop&w=900&q=80" },
  { src: "https://images.unsplash.com/photo-1572044162444-ad60f128bdea?auto=format&fit=crop&w=900&q=80" },
  { src: "https://images.unsplash.com/photo-1503602642458-232111445657?auto=format&fit=crop&w=900&q=80" },
] as const;
```

- [ ] **Step 4: Rewrite `components/sections/gallery.tsx`**

Replace the whole file (horizontal snap-scroll on mobile, grid on `md+`, hover zoom, sources from `PROJECTS`):

```tsx
import Image from "next/image";
import { Container } from "@/components/layout/container";
import { Reveal } from "@/components/motion/reveal";
import { PROJECTS, SECTION_IDS } from "@/lib/content";
import type { Dictionary } from "@/lib/dictionary";

export function Gallery({ dict }: { dict: Dictionary["gallery"] }) {
  return (
    <section id={SECTION_IDS.work} className="bg-paper-2 py-20">
      <Container>
        <Reveal className="mb-12 max-w-2xl">
          <h2 className="font-display text-3xl font-extrabold sm:text-4xl">{dict.heading}</h2>
          <p className="mt-4 text-lg text-muted">{dict.intro}</p>
        </Reveal>
        <div className="-mx-4 flex snap-x snap-mandatory gap-4 overflow-x-auto px-4 pb-2 md:mx-0 md:grid md:grid-cols-3 md:overflow-visible md:px-0 md:pb-0">
          {PROJECTS.map((project, i) => (
            <Reveal
              key={project.src}
              delay={(i % 3) * 0.05}
              className="w-[78%] shrink-0 snap-start md:w-auto"
            >
              <div className="group relative aspect-[4/3] overflow-hidden rounded-lg border border-line">
                <Image
                  src={project.src}
                  alt={`${dict.imageAltPrefix} ${i + 1}`}
                  fill
                  sizes="(max-width: 768px) 78vw, 33vw"
                  className="object-cover transition-transform duration-500 group-hover:scale-105"
                />
              </div>
            </Reveal>
          ))}
        </div>
      </Container>
    </section>
  );
}
```

- [ ] **Step 5: Run the test to verify it passes**

Run: `npm test -- gallery`
Expected: PASS (renders `PROJECTS.length` images).

- [ ] **Step 6: Visual check**

Reload `/he`: on a narrow window the portfolio scrolls horizontally with snap; at `md+` it's a 3-col grid; hover zooms. Confirm scroll direction feels right in RTL and no whole-page horizontal overflow (the row is the only scroller).

- [ ] **Step 7: Commit**

```bash
export GIT_CONFIG_GLOBAL=/dev/null
git add lib/content.ts components/sections/gallery.tsx components/sections/gallery.test.tsx
git -c user.name="YuvalAltunInabit" -c user.email="yuvala@inabit.com" commit -m "feat(portfolio): card grid + horizontal-scroll showcase from PROJECTS data

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 7: Dark sections → true black (Why + shared) and Studio crispening

**Files:**
- Modify: `components/sections/why.tsx:8` (bg + numbers)
- Modify: `components/sections/studio.tsx:29` (radius)

**Interfaces:**
- Consumes: `bg-ink-deep` token from Task 1.

- [ ] **Step 1: Switch Why to true-black and bolder numbers**

In `components/sections/why.tsx`, change line 8 from `className="bg-ink py-20 text-paper"` to:

```tsx
    <section id={SECTION_IDS.why} className="bg-ink-deep py-20 text-paper">
```

And the heading/number weights — change `font-bold` on the `h2` (line 11) to `font-extrabold`, and the number `span` (lines 18-20) keep `text-accent` (already correct).

- [ ] **Step 2: Crisp Studio image border**

In `components/sections/studio.tsx`, line 29, change `rounded-2xl` to `rounded-lg`, and on the `h2` change `font-bold` to `font-extrabold`.

- [ ] **Step 3: Verify**

Run: `npm run typecheck`
Expected: PASS.

Reload `/he` — the Why section is now true black (#0E0E0E) with white text and red numerals; Studio image is crisper.

- [ ] **Step 4: Commit**

```bash
export GIT_CONFIG_GLOBAL=/dev/null
git add components/sections/why.tsx components/sections/studio.tsx
git -c user.name="YuvalAltunInabit" -c user.email="yuvala@inabit.com" commit -m "style(sections): true-black Why, crisper Studio

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 8: Clients strip → true black + matching fade

**Files:**
- Modify: `components/sections/clients.tsx:22`
- Modify: `components/ui/logos3.tsx:64`

**Interfaces:**
- Consumes: `bg-ink-deep` token. `logos3` dark `tone` fade gradient must match the new black.

- [ ] **Step 1: Switch the clients section background**

In `components/sections/clients.tsx`, line 22, change `className="bg-ink py-16 text-paper"` to:

```tsx
    <section id={SECTION_IDS.clients} className="bg-ink-deep py-16 text-paper">
```

- [ ] **Step 2: Match the carousel fade to black**

In `components/ui/logos3.tsx`, line 64, change the dark fade source:

```tsx
  const fade = tone === "dark" ? "from-ink-deep" : "from-paper";
```

- [ ] **Step 3: Verify**

Run: `npm run typecheck`
Expected: PASS.

Reload `/he` — clients strip is true black; the edge fades blend into the black (no warm seam).

- [ ] **Step 4: Commit**

```bash
export GIT_CONFIG_GLOBAL=/dev/null
git add components/sections/clients.tsx components/ui/logos3.tsx
git -c user.name="YuvalAltunInabit" -c user.email="yuvala@inabit.com" commit -m "style(clients): true-black strip + matching carousel fade

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 9: FAQ + Contact heading weights & crisp form

**Files:**
- Modify: `components/sections/faq.tsx:17`
- Modify: `components/sections/contact.tsx:24,62`

**Interfaces:**
- Consumes: existing `dict.faq`, `dict.contact` (unchanged). Token-driven inputs already use `border-line`/`focus:border-accent`.

- [ ] **Step 1: FAQ heading weight**

In `components/sections/faq.tsx`, line 17, change `font-bold` to `font-extrabold`.

- [ ] **Step 2: Contact heading + form radius**

In `components/sections/contact.tsx`: line 24 change `font-bold` → `font-extrabold`; line 62 change the form wrapper `rounded-2xl` → `rounded-lg`. Leave everything else (inputs, server action, WhatsApp, socials) unchanged.

- [ ] **Step 3: Verify**

Run: `npm run typecheck`
Expected: PASS.

Reload `/he` and `/en` — FAQ accordion and contact heading match the bolder editorial type; form is crisper. The contact details (phone/email/socials from `lib/site-config.ts`) still render.

- [ ] **Step 4: Commit**

```bash
export GIT_CONFIG_GLOBAL=/dev/null
git add components/sections/faq.tsx components/sections/contact.tsx
git -c user.name="YuvalAltunInabit" -c user.email="yuvala@inabit.com" commit -m "style(faq,contact): editorial heading weights, crisp form

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 10: Tune motion quieter

**Files:**
- Modify: `components/motion/reveal.tsx:20-23`

**Interfaces:**
- Consumes/Produces: same `<Reveal>` API (`children, delay?, className?`) — only the animation values change. Reduced-motion path already returns a plain `<div>`.

- [ ] **Step 1: Reduce travel + duration**

In `components/motion/reveal.tsx`, change the `initial` and `transition` to a quieter rise:

```tsx
      initial={{ opacity: 0, y: 16 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: "-80px" }}
      transition={{ duration: 0.4, delay, ease: "easeOut" }}
```

- [ ] **Step 2: Verify reduced-motion still bypasses**

Run: `npm run typecheck`
Expected: PASS. Confirm lines 15-16 (the `if (reduce) return <div>`) are untouched.

Reload `/he` — reveals feel subtler. With OS "reduce motion" on, content appears with no animation.

- [ ] **Step 3: Commit**

```bash
export GIT_CONFIG_GLOBAL=/dev/null
git add components/motion/reveal.tsx
git -c user.name="YuvalAltunInabit" -c user.email="yuvala@inabit.com" commit -m "style(motion): quieter reveal (16px rise, 400ms)

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 11: Full verification + update project docs

**Files:**
- Modify: `.claude/skills/linecut-website/SKILL.md` (Design System table: tokens + display font)
- Modify: `AGENTS.md` only if it references the old font/tokens (it does not — verify)

**Interfaces:** none (docs + verification).

- [ ] **Step 1: Run the full suite**

Run: `npm test`
Expected: PASS — dictionary parity test + hero + gallery tests all green.

Run: `npm run typecheck && npm run build`
Expected: build succeeds with no type errors.

- [ ] **Step 2: RTL/LTR overflow check**

With the dev server up, load http://localhost:3000/he and http://localhost:3000/en. In the browser console run `document.documentElement.scrollWidth === document.documentElement.clientWidth` on each — expected `true` (no horizontal overflow). Confirm the portfolio's own horizontal scroll works without scrolling the page.

- [ ] **Step 3: Update the project skill's Design System section**

In `.claude/skills/linecut-website/SKILL.md`, update the Design System table to reflect: `paper` = white `#FFFFFF`, `paper-2` `#FAFAFA`, `ink` `#141414`, new `ink-deep` `#0E0E0E` for dark sections, `muted` `#5B5B5B`, `line` `#ECECEC`; and change the Fonts line so `font-display` = **Heebo** (was Frank Ruhl Libre). Note the gallery is the horizontal-scroll Portfolio sourced from `PROJECTS` in `lib/content.ts`.

- [ ] **Step 4: Commit the docs + any build artifacts**

```bash
export GIT_CONFIG_GLOBAL=/dev/null
git add .claude/skills/linecut-website/SKILL.md
git -c user.name="YuvalAltunInabit" -c user.email="yuvala@inabit.com" commit -m "docs(skill): record editorial-minimal tokens + Heebo display font

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

- [ ] **Step 5: Final review**

Skim `/he` and `/en` top to bottom: white base, bold Heebo headlines, brick-red only on accents/CTAs, true-black Why + Clients, horizontal-scroll portfolio. The reskin is complete.

---

## Self-Review

**Spec coverage:**
- §3 tokens → Task 1. §3 typography/Heebo → Task 2. §4 Header → satisfied by Task 1 tokens (already a thin sticky bar with a red CTA; no structural change needed — noted). Hero → Task 3. ValueProps → Task 4. Services → Task 5. Gallery→Portfolio → Task 6. Why/Studio → Task 7. Clients → Task 8. FAQ/Contact → Task 9. §5 Motion → Task 10. §7 verification + §6 doc updates → Task 11. ✓
- §8 open item (rename `work`→`portfolio` key) → intentionally NOT done (default: keep the `work` key, restyle only) to protect dictionary parity. Stated in Global Constraints.

**Placeholder scan:** No TBD/TODO-as-work; the two `TODO(client)` strings retained in hero/studio are pre-existing content markers for the client's real photos, not plan gaps.

**Type consistency:** `Project`/`PROJECTS` defined in Task 6 and consumed by the same task's component + test. `--color-ink-deep` defined in Task 1, consumed as `bg-ink-deep`/`from-ink-deep` in Tasks 7-8. `<Reveal>` API unchanged in Task 10. Hero/gallery dict shapes match existing dictionaries (no key changes).
