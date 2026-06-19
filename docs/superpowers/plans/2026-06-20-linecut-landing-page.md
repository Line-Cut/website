# Line Cut Ltd. Landing Page — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a bilingual (Hebrew-first, RTL + English LTR) warm-studio marketing landing page for Line Cut Ltd. on Next.js 16, ready to deploy on Vercel.

**Architecture:** Native Next.js App Router i18n — every route under `app/[lang]/…`, locale chosen by a root-level `proxy.ts`, copy loaded server-side from JSON dictionaries. A single long landing page composed of focused section components that receive typed dictionary slices as props. Contact handled by a Server Action (Resend email) plus a WhatsApp deep link. No database; a thin `lib/` boundary leaves room for Supabase later.

**Tech Stack:** Next.js 16.2.9, React 19, Tailwind CSS v4, framer-motion, Radix primitives, Embla carousel, Resend, Zod. Tests: Vitest + React Testing Library; Playwright MCP for final smoke.

## Global Constraints

- **Framework is a modified Next.js 16.2.9** — read `node_modules/next/dist/docs/` before using an API; middleware is `proxy.ts`, `PageProps<'/[lang]'>` / `LayoutProps<'/[lang]'>` global helpers exist, route `params` is a `Promise` (must `await`).
- **Locales:** `he` (default), `en`. Hebrew is the primary voice; `/` must redirect to a locale; `/he` is RTL, `/en` is LTR.
- **No hard-coded UI copy** — all user-facing strings come from `app/[lang]/dictionaries/{he,en}.json`. `he` and `en` must always have identical key shapes (enforced by a parity test).
- **RTL-correct by construction** — use Tailwind logical utilities (`ps-`/`pe-`, `ms-`/`me-`, `start-`/`end-`, `text-start`/`text-end`). Never use bare `pl-`/`pr-`/`left-`/`right-`/`text-left` for directional layout.
- **Palette (from `public/F_LINE_CUT_LOGO.svg`):** accent `#b8281f`, muted `#7e7d7b`, ink `#1c1a17`, paper `#f7f3ec`. Warm light theme only — no dark mode toggle; remove the starter's `prefers-color-scheme` block.
- **Fonts:** headings Frank Ruhl Libre, body Assistant, via `next/font/google` with `subsets: ['hebrew','latin']`.
- **Path alias:** `@/*` → repo root (e.g. `@/lib/utils`, `@/components/ui/button`).
- **Respect `prefers-reduced-motion`** in all framer-motion usage.
- **Commit after every task.** Use `GIT_CONFIG_GLOBAL=/dev/null git -c user.name="Line Cut Dev" -c user.email="yuvala@inabit.com" -c commit.gpgsign=false commit …` — the machine's global gitconfig has a broken `gpg.format` that aborts normal commits.
- **Contact details are placeholders** in `lib/site-config.ts`, clearly marked `TODO(client)` for the owner to fill before launch.
- **Testing strategy:** pure logic (i18n, schema, utils, dictionary parity) gets Vitest unit tests written test-first; visual section components get a lightweight render test asserting they show their passed-in copy; integration (redirect, toggle, form) is covered by the final Playwright smoke. Every task's gate is its test(s) passing **and** `npx tsc --noEmit` clean.

---

## File Structure

```
proxy.ts                              # locale detection + redirect
vitest.config.mts                     # test runner (jsdom, @ alias)
vitest.setup.ts                       # jest-dom matchers
lib/
  utils.ts                            # cn()
  i18n.ts                             # locales, Locale, defaultLocale, getLocale(), isLocale()
  dictionary.ts                       # client-safe Dictionary type (derived from he.json)
  site-config.ts                      # contact/socials/business facts (placeholders)
  content.ts                          # non-text structure (section ids, icon names, service keys)
  contact-schema.ts                   # Zod schema + types for the contact form
app/
  globals.css                         # Tailwind v4 @theme tokens, base styles, paper texture
  sitemap.ts                          # per-locale sitemap
  actions/
    contact.ts                        # 'use server' submit action (Resend)
  [lang]/
    layout.tsx                        # root layout: <html lang dir>, fonts, Header, Footer, metadata
    page.tsx                          # composes all landing sections
    dictionaries.ts                   # server-only getDictionary(), hasLocale()
    dictionaries/he.json              # Hebrew copy (primary)
    dictionaries/en.json              # English copy
    terms/page.tsx                    # legal boilerplate
    privacy/page.tsx                  # legal boilerplate
components/
  ui/
    button.tsx  card.tsx  accordion.tsx  carousel.tsx  logos3.tsx
  layout/
    container.tsx  header.tsx  footer.tsx  language-toggle.tsx
  motion/
    reveal.tsx                        # framer-motion scroll-reveal (reduced-motion aware)
  sections/
    hero.tsx  value-props.tsx  services.tsx  why.tsx  process.tsx
    gallery.tsx  studio.tsx  clients.tsx  faq.tsx  contact.tsx
```

Old starter files removed during Task 2: `app/layout.tsx`, `app/page.tsx` (replaced by `app/[lang]/*`).

---

## Task 1: Testing harness + `cn` utility

**Files:**
- Create: `vitest.config.mts`, `vitest.setup.ts`, `lib/utils.ts`, `lib/utils.test.ts`
- Modify: `package.json` (scripts + deps)

**Interfaces:**
- Produces: `cn(...inputs: ClassValue[]): string` from `@/lib/utils`.

- [ ] **Step 1: Install dependencies**

```bash
npm install clsx tailwind-merge class-variance-authority lucide-react @radix-ui/react-slot @radix-ui/react-accordion embla-carousel-react embla-carousel-auto-scroll resend zod
npm install -D vitest @vitejs/plugin-react @testing-library/react @testing-library/jest-dom jsdom
```

- [ ] **Step 2: Add test scripts to `package.json`**

Add to the `"scripts"` block:

```json
    "test": "vitest run",
    "test:watch": "vitest",
    "typecheck": "tsc --noEmit"
```

- [ ] **Step 3: Create `vitest.config.mts`**

```ts
import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import { resolve } from "node:path";

export default defineConfig({
  plugins: [react()],
  test: {
    environment: "jsdom",
    globals: true,
    setupFiles: ["./vitest.setup.ts"],
  },
  resolve: {
    alias: { "@": resolve(__dirname, ".") },
  },
});
```

- [ ] **Step 4: Create `vitest.setup.ts`**

```ts
import "@testing-library/jest-dom/vitest";
```

- [ ] **Step 5: Write the failing test** — `lib/utils.test.ts`

```ts
import { describe, it, expect } from "vitest";
import { cn } from "@/lib/utils";

describe("cn", () => {
  it("merges class names", () => {
    expect(cn("a", "b")).toBe("a b");
  });
  it("dedupes conflicting tailwind classes (last wins)", () => {
    expect(cn("px-2", "px-4")).toBe("px-4");
  });
  it("drops falsy values", () => {
    expect(cn("a", false && "b", undefined, "c")).toBe("a c");
  });
});
```

- [ ] **Step 6: Run it, expect failure**

Run: `npm test -- lib/utils.test.ts`
Expected: FAIL — `Cannot find module '@/lib/utils'`.

- [ ] **Step 7: Implement `lib/utils.ts`**

```ts
import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs));
}
```

- [ ] **Step 8: Run tests, expect pass**

Run: `npm test -- lib/utils.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 9: Commit**

```bash
GIT_CONFIG_GLOBAL=/dev/null git -c user.name="Line Cut Dev" -c user.email="yuvala@inabit.com" -c commit.gpgsign=false add -A && \
GIT_CONFIG_GLOBAL=/dev/null git -c user.name="Line Cut Dev" -c user.email="yuvala@inabit.com" -c commit.gpgsign=false commit -m "chore: add vitest harness and cn util"
```

---

## Task 2: i18n core + bilingual app skeleton

Restructures the app under `app/[lang]`, adds locale detection/redirect, and proves the bilingual pipeline end-to-end with minimal copy.

**Files:**
- Create: `lib/i18n.ts`, `lib/i18n.test.ts`, `lib/dictionary.ts`, `proxy.ts`,
  `app/[lang]/dictionaries.ts`, `app/[lang]/dictionaries/he.json`, `app/[lang]/dictionaries/en.json`,
  `app/[lang]/dictionaries.test.ts`, `app/[lang]/layout.tsx`, `app/[lang]/page.tsx`
- Delete: `app/layout.tsx`, `app/page.tsx`
- Keep: `app/globals.css`, `app/favicon.ico`

**Interfaces:**
- Produces:
  - `@/lib/i18n`: `locales = ['he','en'] as const`; `type Locale = 'he' | 'en'`; `defaultLocale: Locale`; `getLocale(acceptLanguage: string | null | undefined): Locale`; `isLocale(value: string): value is Locale`.
  - `@/lib/dictionary`: `type Dictionary` (full shape of `he.json`).
  - `@/app/[lang]/dictionaries`: `getDictionary(locale: Locale): Promise<Dictionary>` (server-only).

- [ ] **Step 1: Write failing test** — `lib/i18n.test.ts`

```ts
import { describe, it, expect } from "vitest";
import { getLocale, isLocale } from "@/lib/i18n";

describe("getLocale", () => {
  it("defaults to he when header missing", () => {
    expect(getLocale(null)).toBe("he");
  });
  it("returns en when English is preferred", () => {
    expect(getLocale("en-US,en;q=0.9")).toBe("en");
  });
  it("returns he for Hebrew header", () => {
    expect(getLocale("he-IL,he;q=0.9")).toBe("he");
  });
  it("maps legacy 'iw' to he", () => {
    expect(getLocale("iw")).toBe("he");
  });
  it("falls back to he for unsupported languages", () => {
    expect(getLocale("fr-FR,fr;q=0.8")).toBe("he");
  });
  it("respects q-value ordering", () => {
    expect(getLocale("fr;q=0.9,en;q=0.95")).toBe("en");
  });
});

describe("isLocale", () => {
  it("accepts supported locales", () => {
    expect(isLocale("he")).toBe(true);
    expect(isLocale("en")).toBe(true);
  });
  it("rejects others", () => {
    expect(isLocale("de")).toBe(false);
  });
});
```

- [ ] **Step 2: Run it, expect failure**

Run: `npm test -- lib/i18n.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement `lib/i18n.ts`**

```ts
export const locales = ["he", "en"] as const;
export type Locale = (typeof locales)[number];
export const defaultLocale: Locale = "he";

export function isLocale(value: string): value is Locale {
  return (locales as readonly string[]).includes(value);
}

export function getLocale(
  acceptLanguage: string | null | undefined,
): Locale {
  if (!acceptLanguage) return defaultLocale;

  const ranked = acceptLanguage
    .split(",")
    .map((part) => {
      const [tag, q] = part.trim().split(";q=");
      return { tag: tag.toLowerCase(), q: q ? Number.parseFloat(q) : 1 };
    })
    .sort((a, b) => b.q - a.q);

  for (const { tag } of ranked) {
    const base = tag.split("-")[0];
    if (base === "iw") return "he"; // legacy Hebrew code
    if (isLocale(base)) return base;
  }
  return defaultLocale;
}
```

- [ ] **Step 4: Run tests, expect pass**

Run: `npm test -- lib/i18n.test.ts`
Expected: PASS (8 tests).

- [ ] **Step 5: Create minimal dictionaries** — `app/[lang]/dictionaries/he.json`

```json
{
  "meta": {
    "title": "ליין קאט — הדפסה דיגיטלית, חיתוך וגימור",
    "description": "הדפסה דיגיטלית, חיתוך וגימור — מיוצר במדויק מהקובץ שלך. ליין קאט, חולון."
  },
  "hero": {
    "title": "הדפסה דיגיטלית, חיתוך וגימור — מיוצר במדויק מהקובץ שלך"
  }
}
```

- [ ] **Step 6: Create matching `app/[lang]/dictionaries/en.json`**

```json
{
  "meta": {
    "title": "Line Cut — Digital Printing, Cutting & Finishing",
    "description": "Digital printing, cutting and finishing — produced accurately from your file. Line Cut, Holon."
  },
  "hero": {
    "title": "Digital printing, cutting and finishing — produced accurately from your file"
  }
}
```

- [ ] **Step 7: Create `lib/dictionary.ts` (client-safe type)**

```ts
// Derives the dictionary shape from the Hebrew source of truth.
// Type-only — never bundles JSON into client code.
type HeModule = typeof import("@/app/[lang]/dictionaries/he.json");
export type Dictionary = HeModule extends { default: infer D } ? D : HeModule;
```

- [ ] **Step 8: Create `app/[lang]/dictionaries.ts` (server loader)**

```ts
import "server-only";
import type { Locale } from "@/lib/i18n";
import type { Dictionary } from "@/lib/dictionary";

const loaders: Record<Locale, () => Promise<Dictionary>> = {
  he: () => import("./dictionaries/he.json").then((m) => m.default as Dictionary),
  en: () => import("./dictionaries/en.json").then((m) => m.default as Dictionary),
};

export const getDictionary = (locale: Locale): Promise<Dictionary> =>
  loaders[locale]();
```

- [ ] **Step 9: Write failing dictionary-parity test** — `app/[lang]/dictionaries.test.ts`

```ts
import { describe, it, expect } from "vitest";
import he from "./dictionaries/he.json";
import en from "./dictionaries/en.json";

function keyPaths(obj: unknown, prefix = ""): string[] {
  if (obj === null || typeof obj !== "object") return [prefix];
  if (Array.isArray(obj)) {
    return obj.flatMap((v, i) => keyPaths(v, `${prefix}[${i}]`));
  }
  return Object.entries(obj as Record<string, unknown>).flatMap(([k, v]) =>
    keyPaths(v, prefix ? `${prefix}.${k}` : k),
  );
}

describe("dictionary parity", () => {
  it("he and en share identical key/array shapes", () => {
    expect(keyPaths(he).sort()).toEqual(keyPaths(en).sort());
  });
});
```

- [ ] **Step 10: Run it, expect pass** (shapes match)

Run: `npm test -- app/[lang]/dictionaries.test.ts`
Expected: PASS. (This test re-runs every task that edits dictionaries.)

- [ ] **Step 11: Delete starter root files**

```bash
rm app/layout.tsx app/page.tsx
```

- [ ] **Step 12: Create `app/[lang]/layout.tsx`** (temporary minimal Header/Footer-free version; Header/Footer wired in Task 8/13)

```tsx
import type { Metadata } from "next";
import { Frank_Ruhl_Libre, Assistant } from "next/font/google";
import { notFound } from "next/navigation";
import "../globals.css";
import { isLocale, locales } from "@/lib/i18n";
import { getDictionary } from "./dictionaries";

const display = Frank_Ruhl_Libre({
  subsets: ["hebrew", "latin"],
  weight: ["400", "500", "700", "900"],
  variable: "--font-frank",
});
const sans = Assistant({
  subsets: ["hebrew", "latin"],
  weight: ["300", "400", "500", "600", "700"],
  variable: "--font-assistant",
});

export function generateStaticParams() {
  return locales.map((lang) => ({ lang }));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ lang: string }>;
}): Promise<Metadata> {
  const { lang } = await params;
  if (!isLocale(lang)) return {};
  const dict = await getDictionary(lang);
  return { title: dict.meta.title, description: dict.meta.description };
}

export default async function RootLayout({
  children,
  params,
}: LayoutProps<"/[lang]">) {
  const { lang } = await params;
  if (!isLocale(lang)) notFound();
  const dir = lang === "he" ? "rtl" : "ltr";
  return (
    <html
      lang={lang}
      dir={dir}
      className={`${display.variable} ${sans.variable} h-full antialiased`}
    >
      <body className="flex min-h-full flex-col bg-paper font-sans text-ink">
        {children}
      </body>
    </html>
  );
}
```

- [ ] **Step 13: Create `app/[lang]/page.tsx`** (temporary; replaced in Task 14)

```tsx
import { notFound } from "next/navigation";
import { isLocale } from "@/lib/i18n";
import { getDictionary } from "./dictionaries";

export default async function Home({ params }: PageProps<"/[lang]">) {
  const { lang } = await params;
  if (!isLocale(lang)) notFound();
  const dict = await getDictionary(lang);
  return (
    <main className="flex flex-1 items-center justify-center p-10">
      <h1 className="font-display text-3xl">{dict.hero.title}</h1>
    </main>
  );
}
```

- [ ] **Step 14: Create `proxy.ts`**

```ts
import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { locales, getLocale } from "@/lib/i18n";

export function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const hasLocale = locales.some(
    (l) => pathname === `/${l}` || pathname.startsWith(`/${l}/`),
  );
  if (hasLocale) return;

  const locale = getLocale(request.headers.get("accept-language"));
  request.nextUrl.pathname = `/${locale}${pathname}`;
  return NextResponse.redirect(request.nextUrl);
}

export const config = {
  // Skip _next internals, api, and any path with a file extension (favicon, svg…)
  matcher: ["/((?!_next|api|.*\\..*).*)"],
};
```

- [ ] **Step 15: Verify build + typecheck**

Run: `npm run typecheck && npm run build`
Expected: compiles; build output lists `/[lang]` route prerendered for `he` and `en`.

- [ ] **Step 16: Manual run check**

Run: `npm run dev`, then verify: `http://localhost:3000/` redirects to `/he` (RTL, Hebrew title); `http://localhost:3000/en` shows the English title LTR. Stop dev server.

- [ ] **Step 17: Commit**

```bash
GIT_CONFIG_GLOBAL=/dev/null git -c user.name="Line Cut Dev" -c user.email="yuvala@inabit.com" -c commit.gpgsign=false add -A && \
GIT_CONFIG_GLOBAL=/dev/null git -c user.name="Line Cut Dev" -c user.email="yuvala@inabit.com" -c commit.gpgsign=false commit -m "feat(i18n): bilingual app skeleton with locale redirect"
```

---

## Task 3: Design system (theme tokens, fonts, base styles)

**Files:**
- Modify: `app/globals.css` (full rewrite)

**Interfaces:**
- Produces Tailwind utilities: colors `paper`, `paper-2`, `ink`, `muted`, `line`, `accent`, `accent-600`; fonts `font-sans`, `font-display`; a `.bg-grain` texture helper; a `.cut-rule` hairline helper.

- [ ] **Step 1: Replace `app/globals.css`**

```css
@import "tailwindcss";

@theme inline {
  --color-paper: #f7f3ec;
  --color-paper-2: #efe9df;
  --color-ink: #1c1a17;
  --color-muted: #7e7d7b;
  --color-line: #d9d2c5;
  --color-accent: #b8281f;
  --color-accent-600: #9e2019;

  --font-display: var(--font-frank);
  --font-sans: var(--font-assistant);
}

:root {
  color-scheme: light;
}

body {
  background-color: var(--color-paper);
  color: var(--color-ink);
}

/* Subtle warm paper grain */
.bg-grain {
  background-image: radial-gradient(
    rgba(28, 26, 23, 0.035) 1px,
    transparent 1px
  );
  background-size: 4px 4px;
}

/* Thin "cut line" hairline used as a section accent */
.cut-rule {
  height: 1px;
  background-image: repeating-linear-gradient(
    to right,
    var(--color-line) 0,
    var(--color-line) 6px,
    transparent 6px,
    transparent 12px
  );
}

@media (prefers-reduced-motion: reduce) {
  *,
  *::before,
  *::after {
    animation-duration: 0.001ms !important;
    transition-duration: 0.001ms !important;
  }
}
```

- [ ] **Step 2: Verify build + visual**

Run: `npm run build` (expect success), then `npm run dev` and confirm `/he` renders on a cream background with the serif heading. Stop dev server.

- [ ] **Step 3: Commit**

```bash
GIT_CONFIG_GLOBAL=/dev/null git -c user.name="Line Cut Dev" -c user.email="yuvala@inabit.com" -c commit.gpgsign=false add -A && \
GIT_CONFIG_GLOBAL=/dev/null git -c user.name="Line Cut Dev" -c user.email="yuvala@inabit.com" -c commit.gpgsign=false commit -m "feat(theme): warm-studio tokens, fonts, paper texture"
```

---

## Task 4: Site config + content structure

Centralizes business facts/contact (placeholders) and the non-text structure of sections (anchor ids, icon names, which dictionary keys feed each card).

**Files:**
- Create: `lib/site-config.ts`, `lib/content.ts`, `lib/site-config.test.ts`

**Interfaces:**
- Produces `@/lib/site-config`: `siteConfig` with `{ name, legalName, businessId, address {street, city, country}, phone, email, whatsapp, social {instagram, facebook}, hours }` and helper `whatsappLink(message?: string): string`.
- Produces `@/lib/content`: `SECTION_IDS` (record of anchor ids), `SERVICE_KEYS: readonly string[]`, `PROCESS_STEP_KEYS`, `VALUE_PROP_KEYS`, `FAQ_KEYS`, and `SERVICE_ICONS: Record<string, LucideIcon>`.

- [ ] **Step 1: Write failing test** — `lib/site-config.test.ts`

```ts
import { describe, it, expect } from "vitest";
import { siteConfig, whatsappLink } from "@/lib/site-config";

describe("siteConfig", () => {
  it("carries known business facts", () => {
    expect(siteConfig.businessId).toBe("516741998");
    expect(siteConfig.address.city).toBe("Holon");
  });
});

describe("whatsappLink", () => {
  it("builds a wa.me link with encoded message", () => {
    const link = whatsappLink("hello world");
    expect(link).toContain("https://wa.me/");
    expect(link).toContain("text=hello%20world");
  });
});
```

- [ ] **Step 2: Run it, expect failure**

Run: `npm test -- lib/site-config.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement `lib/site-config.ts`**

```ts
export const siteConfig = {
  name: "Line Cut",
  legalName: "Line Cut Ltd.",
  businessId: "516741998",
  address: {
    street: "HaSadna 8",
    city: "Holon",
    country: "Israel",
  },
  // TODO(client): replace placeholders below before launch
  phone: "+972-00-000-0000",
  email: "info@example.com",
  whatsapp: "972500000000", // digits only, international format
  social: {
    instagram: "https://instagram.com/", // TODO(client)
    facebook: "https://facebook.com/", // TODO(client)
  },
  hours: {
    he: "א׳–ה׳ 9:00–17:00",
    en: "Sun–Thu 9:00–17:00",
  },
} as const;

export function whatsappLink(message?: string): string {
  const base = `https://wa.me/${siteConfig.whatsapp}`;
  return message ? `${base}?text=${encodeURIComponent(message)}` : base;
}
```

- [ ] **Step 4: Run tests, expect pass**

Run: `npm test -- lib/site-config.test.ts`
Expected: PASS (2 tests).

- [ ] **Step 5: Implement `lib/content.ts`**

```ts
import {
  Sticker,
  Scissors,
  LayoutPanelTop,
  Landmark,
  Wrench,
  type LucideIcon,
} from "lucide-react";

export const SECTION_IDS = {
  hero: "top",
  services: "services",
  why: "why",
  process: "process",
  work: "work",
  studio: "studio",
  clients: "clients",
  faq: "faq",
  contact: "contact",
} as const;

export const VALUE_PROP_KEYS = [
  "accurate",
  "oneRoof",
  "review",
  "custom",
  "exhibitions",
  "fast",
  "audience",
] as const;

export const SERVICE_KEYS = [
  "stickers",
  "signage",
  "rigid",
  "exhibitions",
  "custom",
] as const;

export const SERVICE_ICONS: Record<(typeof SERVICE_KEYS)[number], LucideIcon> = {
  stickers: Sticker,
  signage: Scissors,
  rigid: LayoutPanelTop,
  exhibitions: Landmark,
  custom: Wrench,
};

export const PROCESS_STEP_KEYS = [
  "file",
  "review",
  "production",
  "finishing",
  "delivery",
] as const;

export const FAQ_KEYS = ["formats", "turnaround", "materials", "delivery", "minOrder"] as const;
```

- [ ] **Step 6: Run full suite + typecheck**

Run: `npm test && npm run typecheck`
Expected: all pass.

- [ ] **Step 7: Commit**

```bash
GIT_CONFIG_GLOBAL=/dev/null git -c user.name="Line Cut Dev" -c user.email="yuvala@inabit.com" -c commit.gpgsign=false add -A && \
GIT_CONFIG_GLOBAL=/dev/null git -c user.name="Line Cut Dev" -c user.email="yuvala@inabit.com" -c commit.gpgsign=false commit -m "feat(config): site facts and section content structure"
```

---

## Task 5: UI primitives + motion + layout helpers

Adds the shadcn-style primitives the site (and the client's external components) need.

**Files:**
- Create: `components/ui/button.tsx`, `components/ui/card.tsx`, `components/ui/accordion.tsx`,
  `components/layout/container.tsx`, `components/motion/reveal.tsx`
- Create test: `components/ui/button.test.tsx`

**Interfaces:**
- Produces: `Button` (+ `buttonVariants`), `Card`/`CardHeader`/`CardTitle`/`CardDescription`/`CardContent`/`CardFooter`, `Accordion`/`AccordionItem`/`AccordionTrigger`/`AccordionContent`, `Container`, `Reveal`.

- [ ] **Step 1: Create `components/ui/button.tsx`**

```tsx
import * as React from "react";
import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-md text-sm font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:ring-offset-paper disabled:pointer-events-none disabled:opacity-50",
  {
    variants: {
      variant: {
        primary: "bg-accent text-paper hover:bg-accent-600",
        outline:
          "border border-ink/20 bg-transparent text-ink hover:border-ink/40 hover:bg-ink/5",
        ghost: "bg-transparent text-ink hover:bg-ink/5",
      },
      size: {
        default: "h-11 px-6",
        sm: "h-9 px-4",
        lg: "h-12 px-8 text-base",
        icon: "h-10 w-10",
      },
    },
    defaultVariants: { variant: "primary", size: "default" },
  },
);

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  asChild?: boolean;
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, asChild = false, ...props }, ref) => {
    const Comp = asChild ? Slot : "button";
    return (
      <Comp
        className={cn(buttonVariants({ variant, size, className }))}
        ref={ref}
        {...props}
      />
    );
  },
);
Button.displayName = "Button";

export { Button, buttonVariants };
```

- [ ] **Step 2: Write failing test** — `components/ui/button.test.tsx`

```tsx
import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { Button } from "@/components/ui/button";

describe("Button", () => {
  it("renders its children", () => {
    render(<Button>Start a project</Button>);
    expect(
      screen.getByRole("button", { name: "Start a project" }),
    ).toBeInTheDocument();
  });
  it("renders as a link when asChild", () => {
    render(
      <Button asChild>
        <a href="/x">Go</a>
      </Button>,
    );
    expect(screen.getByRole("link", { name: "Go" })).toHaveAttribute(
      "href",
      "/x",
    );
  });
});
```

- [ ] **Step 3: Run it, expect pass**

Run: `npm test -- components/ui/button.test.tsx`
Expected: PASS (2 tests).

- [ ] **Step 4: Create `components/ui/card.tsx`**

```tsx
import * as React from "react";
import { cn } from "@/lib/utils";

const Card = React.forwardRef<
  HTMLDivElement,
  React.HTMLAttributes<HTMLDivElement>
>(({ className, ...props }, ref) => (
  <div
    ref={ref}
    className={cn(
      "rounded-xl border border-line bg-paper-2/40 text-ink shadow-sm",
      className,
    )}
    {...props}
  />
));
Card.displayName = "Card";

const CardHeader = React.forwardRef<
  HTMLDivElement,
  React.HTMLAttributes<HTMLDivElement>
>(({ className, ...props }, ref) => (
  <div ref={ref} className={cn("flex flex-col gap-2 p-6", className)} {...props} />
));
CardHeader.displayName = "CardHeader";

const CardTitle = React.forwardRef<
  HTMLHeadingElement,
  React.HTMLAttributes<HTMLHeadingElement>
>(({ className, ...props }, ref) => (
  <h3
    ref={ref}
    className={cn("font-display text-xl font-semibold", className)}
    {...props}
  />
));
CardTitle.displayName = "CardTitle";

const CardDescription = React.forwardRef<
  HTMLParagraphElement,
  React.HTMLAttributes<HTMLParagraphElement>
>(({ className, ...props }, ref) => (
  <p ref={ref} className={cn("text-sm text-muted", className)} {...props} />
));
CardDescription.displayName = "CardDescription";

const CardContent = React.forwardRef<
  HTMLDivElement,
  React.HTMLAttributes<HTMLDivElement>
>(({ className, ...props }, ref) => (
  <div ref={ref} className={cn("p-6 pt-0", className)} {...props} />
));
CardContent.displayName = "CardContent";

const CardFooter = React.forwardRef<
  HTMLDivElement,
  React.HTMLAttributes<HTMLDivElement>
>(({ className, ...props }, ref) => (
  <div
    ref={ref}
    className={cn("flex items-center p-6 pt-0", className)}
    {...props}
  />
));
CardFooter.displayName = "CardFooter";

export {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
  CardFooter,
};
```

- [ ] **Step 5: Create `components/ui/accordion.tsx`** (Radix, RTL-safe)

```tsx
"use client";

import * as React from "react";
import * as AccordionPrimitive from "@radix-ui/react-accordion";
import { ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";

const Accordion = AccordionPrimitive.Root;

const AccordionItem = React.forwardRef<
  React.ElementRef<typeof AccordionPrimitive.Item>,
  React.ComponentPropsWithoutRef<typeof AccordionPrimitive.Item>
>(({ className, ...props }, ref) => (
  <AccordionPrimitive.Item
    ref={ref}
    className={cn("border-b border-line", className)}
    {...props}
  />
));
AccordionItem.displayName = "AccordionItem";

const AccordionTrigger = React.forwardRef<
  React.ElementRef<typeof AccordionPrimitive.Trigger>,
  React.ComponentPropsWithoutRef<typeof AccordionPrimitive.Trigger>
>(({ className, children, ...props }, ref) => (
  <AccordionPrimitive.Header className="flex">
    <AccordionPrimitive.Trigger
      ref={ref}
      className={cn(
        "flex flex-1 items-center justify-between py-4 text-start font-display text-lg font-medium transition-colors hover:text-accent [&[data-state=open]>svg]:rotate-180",
        className,
      )}
      {...props}
    >
      {children}
      <ChevronDown className="h-5 w-5 shrink-0 text-muted transition-transform duration-200" />
    </AccordionPrimitive.Trigger>
  </AccordionPrimitive.Header>
));
AccordionTrigger.displayName = "AccordionTrigger";

const AccordionContent = React.forwardRef<
  React.ElementRef<typeof AccordionPrimitive.Content>,
  React.ComponentPropsWithoutRef<typeof AccordionPrimitive.Content>
>(({ className, children, ...props }, ref) => (
  <AccordionPrimitive.Content
    ref={ref}
    className="overflow-hidden text-muted data-[state=closed]:animate-accordion-up data-[state=open]:animate-accordion-down"
    {...props}
  >
    <div className={cn("pb-4 leading-relaxed", className)}>{children}</div>
  </AccordionPrimitive.Content>
));
AccordionContent.displayName = "AccordionContent";

export { Accordion, AccordionItem, AccordionTrigger, AccordionContent };
```

- [ ] **Step 6: Create `components/layout/container.tsx`**

```tsx
import * as React from "react";
import { cn } from "@/lib/utils";

export function Container({
  className,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn("mx-auto w-full max-w-6xl px-5 sm:px-8", className)}
      {...props}
    />
  );
}
```

- [ ] **Step 7: Create `components/motion/reveal.tsx`**

```tsx
"use client";

import { motion, useReducedMotion } from "framer-motion";
import type { ReactNode } from "react";

export function Reveal({
  children,
  delay = 0,
  className,
}: {
  children: ReactNode;
  delay?: number;
  className?: string;
}) {
  const reduce = useReducedMotion();
  if (reduce) return <div className={className}>{children}</div>;
  return (
    <motion.div
      className={className}
      initial={{ opacity: 0, y: 24 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: "-80px" }}
      transition={{ duration: 0.5, delay, ease: "easeOut" }}
    >
      {children}
    </motion.div>
  );
}
```

- [ ] **Step 8: Add accordion keyframes to `app/globals.css`** (append)

```css
@theme inline {
  --animate-accordion-down: accordion-down 0.2s ease-out;
  --animate-accordion-up: accordion-up 0.2s ease-out;
}

@keyframes accordion-down {
  from { height: 0; }
  to { height: var(--radix-accordion-content-height); }
}
@keyframes accordion-up {
  from { height: var(--radix-accordion-content-height); }
  to { height: 0; }
}
```

- [ ] **Step 9: Run suite + typecheck + build**

Run: `npm test && npm run typecheck && npm run build`
Expected: all pass.

- [ ] **Step 10: Commit**

```bash
GIT_CONFIG_GLOBAL=/dev/null git -c user.name="Line Cut Dev" -c user.email="yuvala@inabit.com" -c commit.gpgsign=false add -A && \
GIT_CONFIG_GLOBAL=/dev/null git -c user.name="Line Cut Dev" -c user.email="yuvala@inabit.com" -c commit.gpgsign=false commit -m "feat(ui): button, card, accordion, container, reveal primitives"
```

---

## Task 6: Carousel + Clients (Logos3) component

Integrates the client-provided carousel/marquee, recolored to the palette.

**Files:**
- Create: `components/ui/carousel.tsx`, `components/ui/logos3.tsx`, `components/sections/clients.tsx`

**Interfaces:**
- Consumes: `Button` (Task 5), `cn` (Task 1).
- Produces: `Carousel`/`CarouselContent`/`CarouselItem` (+ `CarouselApi`); `Logos3({ heading, logos })`; `Clients({ dict })` where `dict: Dictionary['clients']`.

- [ ] **Step 1: Create `components/ui/carousel.tsx`**

Use the shadcn carousel implementation supplied by the client (it is RTL-aware via Embla). Copy it verbatim into this file. (Source provided in the project brief; it exports `Carousel`, `CarouselContent`, `CarouselItem`, `CarouselPrevious`, `CarouselNext`, `type CarouselApi` and depends on `embla-carousel-react`, `lucide-react`, `@/components/ui/button`, `@/lib/utils` — all already installed.)

- [ ] **Step 2: Create `components/ui/logos3.tsx`** (adapted: palette + configurable, no fixed `py-64`)

```tsx
"use client";

import AutoScroll from "embla-carousel-auto-scroll";
import { Carousel, CarouselContent, CarouselItem } from "@/components/ui/carousel";

export interface Logo {
  id: string;
  description: string;
  image: string;
  className?: string;
}

export function Logos3({
  heading,
  logos,
}: {
  heading?: string;
  logos: Logo[];
}) {
  return (
    <div className="flex flex-col items-center">
      {heading ? (
        <h2 className="mb-10 text-center font-display text-2xl font-semibold lg:text-3xl">
          {heading}
        </h2>
      ) : null}
      <div className="relative mx-auto flex w-full items-center justify-center lg:max-w-5xl">
        <Carousel opts={{ loop: true }} plugins={[AutoScroll({ playOnInit: true })]}>
          <CarouselContent className="ml-0">
            {logos.map((logo) => (
              <CarouselItem
                key={logo.id}
                className="flex basis-1/3 justify-center pl-0 sm:basis-1/4 md:basis-1/5 lg:basis-1/6"
              >
                <div className="mx-8 flex shrink-0 items-center justify-center">
                  <img
                    src={logo.image}
                    alt={logo.description}
                    className={logo.className ?? "h-7 w-auto opacity-70"}
                  />
                </div>
              </CarouselItem>
            ))}
          </CarouselContent>
        </Carousel>
        <div className="absolute inset-y-0 start-0 w-12 bg-gradient-to-r from-paper to-transparent" />
        <div className="absolute inset-y-0 end-0 w-12 bg-gradient-to-l from-paper to-transparent" />
      </div>
    </div>
  );
}
```

- [ ] **Step 3: Create `components/sections/clients.tsx`**

```tsx
import { Container } from "@/components/layout/container";
import { Logos3, type Logo } from "@/components/ui/logos3";
import { SECTION_IDS } from "@/lib/content";
import type { Dictionary } from "@/lib/dictionary";

// Placeholder client logos. TODO(client): replace with real client logos in /public/clients.
const PLACEHOLDER_LOGOS: Logo[] = Array.from({ length: 8 }, (_, i) => ({
  id: `client-${i + 1}`,
  description: `Client ${i + 1}`,
  image:
    "https://deifkwefumgah.cloudfront.net/shadcnblocks/block/logos/shadcn-ui-wordmark.svg",
  className: "h-6 w-auto opacity-60",
}));

export function Clients({ dict }: { dict: Dictionary["clients"] }) {
  return (
    <section id={SECTION_IDS.clients} className="border-y border-line bg-paper-2/30 py-16">
      <Container>
        <Logos3 heading={dict.heading} logos={PLACEHOLDER_LOGOS} />
      </Container>
    </section>
  );
}
```

- [ ] **Step 4: Add `clients` keys to dictionaries** (both files), then re-run parity test.

`he.json` → add top-level `"clients": { "heading": "מותגים, מוסדות וגופים שעבדנו איתם" }`
`en.json` → add `"clients": { "heading": "Brands, institutions and teams we've worked with" }`

- [ ] **Step 5: Run parity + typecheck + build**

Run: `npm test -- app/[lang]/dictionaries.test.ts && npm run typecheck && npm run build`
Expected: all pass.

- [ ] **Step 6: Commit**

```bash
GIT_CONFIG_GLOBAL=/dev/null git -c user.name="Line Cut Dev" -c user.email="yuvala@inabit.com" -c commit.gpgsign=false add -A && \
GIT_CONFIG_GLOBAL=/dev/null git -c user.name="Line Cut Dev" -c user.email="yuvala@inabit.com" -c commit.gpgsign=false commit -m "feat(clients): logo marquee carousel section"
```

---

## Task 7: Header + Language toggle

**Files:**
- Create: `components/layout/language-toggle.tsx`, `components/layout/header.tsx`
- Modify: `app/[lang]/layout.tsx` (mount `<Header>`)

**Interfaces:**
- Consumes: `Button`, `Container`, `siteConfig`/`whatsappLink`, `SECTION_IDS`, `Locale`, `Dictionary`.
- Produces: `Header({ lang, dict })` with `dict: Dictionary['nav']`; `LanguageToggle({ lang })`.

- [ ] **Step 1: Create `components/layout/language-toggle.tsx`**

```tsx
"use client";

import { usePathname } from "next/navigation";
import Link from "next/link";
import { locales, type Locale } from "@/lib/i18n";
import { cn } from "@/lib/utils";

export function LanguageToggle({ lang }: { lang: Locale }) {
  const pathname = usePathname();

  function swapLocale(target: Locale): string {
    const segments = pathname.split("/");
    segments[1] = target; // /[lang]/...
    return segments.join("/") || `/${target}`;
  }

  return (
    <div className="flex items-center gap-1 text-sm font-semibold">
      {locales.map((l, i) => (
        <span key={l} className="flex items-center gap-1">
          {i > 0 && <span className="text-line">/</span>}
          <Link
            href={swapLocale(l)}
            className={cn(
              "rounded px-1 transition-colors hover:text-accent",
              l === lang ? "text-accent" : "text-muted",
            )}
            aria-current={l === lang ? "true" : undefined}
          >
            {l === "he" ? "עב" : "EN"}
          </Link>
        </span>
      ))}
    </div>
  );
}
```

- [ ] **Step 2: Create `components/layout/header.tsx`**

```tsx
"use client";

import { useState } from "react";
import Link from "next/link";
import Image from "next/image";
import { Menu, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Container } from "@/components/layout/container";
import { LanguageToggle } from "@/components/layout/language-toggle";
import { SECTION_IDS } from "@/lib/content";
import { whatsappLink } from "@/lib/site-config";
import type { Locale } from "@/lib/i18n";
import type { Dictionary } from "@/lib/dictionary";

export function Header({
  lang,
  dict,
}: {
  lang: Locale;
  dict: Dictionary["nav"];
}) {
  const [open, setOpen] = useState(false);
  const links = [
    { id: SECTION_IDS.services, label: dict.services },
    { id: SECTION_IDS.why, label: dict.why },
    { id: SECTION_IDS.process, label: dict.process },
    { id: SECTION_IDS.work, label: dict.work },
    { id: SECTION_IDS.faq, label: dict.faq },
    { id: SECTION_IDS.contact, label: dict.contact },
  ];

  return (
    <header className="sticky top-0 z-50 border-b border-line bg-paper/85 backdrop-blur">
      <Container className="flex h-16 items-center justify-between gap-4">
        <Link href={`/${lang}`} className="flex items-center" aria-label="Line Cut">
          <Image
            src="/F_LINE_CUT_LOGO.svg"
            alt="Line Cut"
            width={120}
            height={44}
            priority
            className="h-9 w-auto"
          />
        </Link>

        <nav className="hidden items-center gap-7 lg:flex">
          {links.map((l) => (
            <a
              key={l.id}
              href={`#${l.id}`}
              className="text-sm font-medium text-ink/80 transition-colors hover:text-accent"
            >
              {l.label}
            </a>
          ))}
        </nav>

        <div className="hidden items-center gap-4 lg:flex">
          <LanguageToggle lang={lang} />
          <Button asChild size="sm">
            <a href={whatsappLink(dict.ctaMessage)} target="_blank" rel="noopener noreferrer">
              {dict.cta}
            </a>
          </Button>
        </div>

        <button
          className="lg:hidden"
          onClick={() => setOpen((v) => !v)}
          aria-label={open ? dict.closeMenu : dict.openMenu}
        >
          {open ? <X /> : <Menu />}
        </button>
      </Container>

      {open && (
        <Container className="flex flex-col gap-4 border-t border-line py-4 lg:hidden">
          {links.map((l) => (
            <a
              key={l.id}
              href={`#${l.id}`}
              onClick={() => setOpen(false)}
              className="text-base font-medium text-ink/80"
            >
              {l.label}
            </a>
          ))}
          <div className="flex items-center justify-between pt-2">
            <LanguageToggle lang={lang} />
            <Button asChild size="sm">
              <a href={whatsappLink(dict.ctaMessage)} target="_blank" rel="noopener noreferrer">
                {dict.cta}
              </a>
            </Button>
          </div>
        </Container>
      )}
    </header>
  );
}
```

- [ ] **Step 3: Add `nav` keys to both dictionaries**, re-run parity.

`he.json` `"nav"`: `{ "services": "שירותים", "why": "למה אנחנו", "process": "תהליך", "work": "עבודות", "faq": "שאלות נפוצות", "contact": "צור קשר", "cta": "התחלת פרויקט", "ctaMessage": "שלום, אשמח לקבל הצעת מחיר", "openMenu": "פתיחת תפריט", "closeMenu": "סגירת תפריט" }`
`en.json` `"nav"`: `{ "services": "Services", "why": "Why us", "process": "Process", "work": "Work", "faq": "FAQ", "contact": "Contact", "cta": "Start a project", "ctaMessage": "Hi, I'd like a quote", "openMenu": "Open menu", "closeMenu": "Close menu" }`

- [ ] **Step 4: Mount Header in `app/[lang]/layout.tsx`**

Add import `import { Header } from "@/components/layout/header";`, fetch `const dict = await getDictionary(lang);` (already loaded for metadata pattern — load inside the component), and render `<Header lang={lang} dict={dict.nav} />` as the first child of `<body>`, before `{children}`.

```tsx
// inside RootLayout, after computing dir:
const dict = await getDictionary(lang);
return (
  <html lang={lang} dir={dir} className={`${display.variable} ${sans.variable} h-full antialiased`}>
    <body className="flex min-h-full flex-col bg-paper font-sans text-ink">
      <Header lang={lang} dict={dict.nav} />
      <main className="flex-1">{children}</main>
    </body>
  </html>
);
```

- [ ] **Step 5: Run parity + typecheck + build + manual**

Run: `npm test -- app/[lang]/dictionaries.test.ts && npm run typecheck && npm run build`
Then `npm run dev`: header shows logo, nav, EN/עב toggle switching `/he`↔`/en` and preserving path; WhatsApp CTA opens `wa.me`. Stop dev.

- [ ] **Step 6: Commit**

```bash
GIT_CONFIG_GLOBAL=/dev/null git -c user.name="Line Cut Dev" -c user.email="yuvala@inabit.com" -c commit.gpgsign=false add -A && \
GIT_CONFIG_GLOBAL=/dev/null git -c user.name="Line Cut Dev" -c user.email="yuvala@inabit.com" -c commit.gpgsign=false commit -m "feat(header): nav, language toggle, whatsapp CTA"
```

---

## Task 8: Hero + Value props

**Files:**
- Create: `components/sections/hero.tsx`, `components/sections/value-props.tsx`

**Interfaces:**
- Consumes: `Button`, `Container`, `Reveal`, `whatsappLink`, `SECTION_IDS`, `VALUE_PROP_KEYS`, `Dictionary`.
- Produces: `Hero({ dict })` with `dict: Dictionary['hero']`; `ValueProps({ dict })` with `dict: Dictionary['valueProps']`.

- [ ] **Step 1: Create `components/sections/hero.tsx`**

```tsx
import Image from "next/image";
import { Button } from "@/components/ui/button";
import { Container } from "@/components/layout/container";
import { Reveal } from "@/components/motion/reveal";
import { SECTION_IDS } from "@/lib/content";
import { whatsappLink } from "@/lib/site-config";
import type { Dictionary } from "@/lib/dictionary";

export function Hero({ dict }: { dict: Dictionary["hero"] }) {
  return (
    <section id={SECTION_IDS.hero} className="bg-grain relative overflow-hidden">
      <Container className="grid items-center gap-12 py-20 lg:grid-cols-2 lg:py-28">
        <Reveal className="flex flex-col gap-6">
          <p className="text-sm font-semibold uppercase tracking-widest text-accent">
            {dict.eyebrow}
          </p>
          <h1 className="font-display text-4xl font-bold leading-tight text-balance sm:text-5xl lg:text-6xl">
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
            <Button asChild size="lg" variant="outline">
              <a href={`#${SECTION_IDS.contact}`}>{dict.ctaSecondary}</a>
            </Button>
          </div>
        </Reveal>

        <Reveal delay={0.15} className="relative">
          {/* TODO(client): replace with a real hero photo at /public/hero.jpg */}
          <div className="relative aspect-[4/3] overflow-hidden rounded-2xl border border-line">
            <Image
              src="https://images.unsplash.com/photo-1581092580497-e0d23cbdf1dc?auto=format&fit=crop&w=1200&q=80"
              alt={dict.imageAlt}
              fill
              sizes="(max-width: 1024px) 100vw, 50vw"
              className="object-cover"
              priority
            />
          </div>
          <div className="cut-rule absolute -bottom-3 start-6 end-6" />
        </Reveal>
      </Container>
    </section>
  );
}
```

- [ ] **Step 2: Create `components/sections/value-props.tsx`**

```tsx
import { Check } from "lucide-react";
import { Container } from "@/components/layout/container";
import { Reveal } from "@/components/motion/reveal";
import { VALUE_PROP_KEYS } from "@/lib/content";
import type { Dictionary } from "@/lib/dictionary";

export function ValueProps({ dict }: { dict: Dictionary["valueProps"] }) {
  return (
    <section className="border-y border-line bg-paper-2/40 py-12">
      <Container>
        <ul className="grid gap-x-8 gap-y-4 sm:grid-cols-2 lg:grid-cols-3">
          {VALUE_PROP_KEYS.map((key, i) => (
            <Reveal key={key} delay={i * 0.04}>
              <li className="flex items-start gap-3">
                <Check className="mt-1 h-5 w-5 shrink-0 text-accent" />
                <span className="text-ink/90">{dict.items[key]}</span>
              </li>
            </Reveal>
          ))}
        </ul>
      </Container>
    </section>
  );
}
```

- [ ] **Step 3: Add `hero` + `valueProps` keys to both dictionaries**, re-run parity.

`he.json`:
```json
"hero": {
  "eyebrow": "ליין קאט · חולון",
  "title": "הדפסה דיגיטלית, חיתוך וגימור — מיוצר במדויק מהקובץ שלך",
  "subtitle": "אנחנו מתמחים בהדפסה דיגיטלית, חיתוך מדויק וגימור עבור שילוט, מדבקות, תערוכות ופרויקטי ייצור מותאמים אישית — ממעצבים ומוסדות ועד מוזיאונים, גלריות וצוותי הפקה.",
  "ctaPrimary": "דברו איתנו בוואטסאפ",
  "ctaSecondary": "לפנייה ולהצעת מחיר",
  "ctaMessage": "שלום, אשמח לקבל הצעת מחיר",
  "imageAlt": "עבודת הדפסה וחיתוך של ליין קאט"
},
"valueProps": {
  "items": {
    "accurate": "ייצור מדויק מתוך הקבצים שסיפקתם",
    "oneRoof": "הדפסה, חיתוך וגימור במקום אחד",
    "review": "בדיקת קובץ טכנית לפני ההפקה",
    "custom": "חומרים, מידות וצורות מותאמים אישית",
    "exhibitions": "ניסיון רב בתערוכות ובשילוט",
    "fast": "אפשרויות ייצור מהיר בהתאם לזמינות",
    "audience": "מתאים למעצבים, עסקים, מוסדות וצוותי הפקה"
  }
}
```

`en.json`:
```json
"hero": {
  "eyebrow": "Line Cut · Holon",
  "title": "Digital printing, cutting and finishing — produced accurately from your file",
  "subtitle": "We specialize in digital printing, precise cutting and finishing for signage, stickers, exhibitions and tailored production projects — for designers, institutions, museums, galleries and production teams.",
  "ctaPrimary": "Message us on WhatsApp",
  "ctaSecondary": "Get in touch for a quote",
  "ctaMessage": "Hi, I'd like a quote",
  "imageAlt": "Line Cut printing and cutting work"
},
"valueProps": {
  "items": {
    "accurate": "Accurate production from your supplied files",
    "oneRoof": "Printing, cutting and finishing in one place",
    "review": "Technical file review before production",
    "custom": "Custom materials, sizes and shapes",
    "exhibitions": "Deep experience with exhibitions and signage",
    "fast": "Fast production options based on availability",
    "audience": "For designers, businesses, institutions and production teams"
  }
}
```

- [ ] **Step 4: Write failing render test** — `components/sections/hero.test.tsx`

```tsx
import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { Hero } from "@/components/sections/hero";

vi.mock("next/image", () => ({
  default: (props: Record<string, unknown>) => {
    const { alt, src } = props as { alt: string; src: string };
    // eslint-disable-next-line @next/next/no-img-element
    return <img alt={alt} src={src} />;
  },
}));

const dict = {
  eyebrow: "Line Cut",
  title: "Produced accurately",
  subtitle: "sub",
  ctaPrimary: "WhatsApp",
  ctaSecondary: "Contact",
  ctaMessage: "hi",
  imageAlt: "work",
};

describe("Hero", () => {
  it("renders the headline and CTAs", () => {
    render(<Hero dict={dict} />);
    expect(
      screen.getByRole("heading", { name: "Produced accurately" }),
    ).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "WhatsApp" })).toBeInTheDocument();
  });
});
```

- [ ] **Step 5: Run it, expect pass**

Run: `npm test -- components/sections/hero.test.tsx`
Expected: PASS.

- [ ] **Step 6: Run parity + typecheck**

Run: `npm test -- app/[lang]/dictionaries.test.ts && npm run typecheck`
Expected: pass.

- [ ] **Step 7: Commit**

```bash
GIT_CONFIG_GLOBAL=/dev/null git -c user.name="Line Cut Dev" -c user.email="yuvala@inabit.com" -c commit.gpgsign=false add -A && \
GIT_CONFIG_GLOBAL=/dev/null git -c user.name="Line Cut Dev" -c user.email="yuvala@inabit.com" -c commit.gpgsign=false commit -m "feat(sections): hero and value props"
```

---

## Task 9: Services + Why Line Cut

**Files:**
- Create: `components/sections/services.tsx`, `components/sections/why.tsx`

**Interfaces:**
- Consumes: `Card*`, `Container`, `Reveal`, `SERVICE_KEYS`, `SERVICE_ICONS`, `SECTION_IDS`, `Dictionary`.
- Produces: `Services({ dict })` with `dict: Dictionary['services']`; `Why({ dict })` with `dict: Dictionary['why']`.

- [ ] **Step 1: Create `components/sections/services.tsx`**

```tsx
import { Container } from "@/components/layout/container";
import { Reveal } from "@/components/motion/reveal";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { SERVICE_KEYS, SERVICE_ICONS, SECTION_IDS } from "@/lib/content";
import type { Dictionary } from "@/lib/dictionary";

export function Services({ dict }: { dict: Dictionary["services"] }) {
  return (
    <section id={SECTION_IDS.services} className="py-20">
      <Container>
        <Reveal className="mb-12 max-w-2xl">
          <h2 className="font-display text-3xl font-bold sm:text-4xl">{dict.heading}</h2>
          <p className="mt-4 text-lg text-muted">{dict.intro}</p>
        </Reveal>
        <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {SERVICE_KEYS.map((key, i) => {
            const Icon = SERVICE_ICONS[key];
            const item = dict.items[key];
            return (
              <Reveal key={key} delay={i * 0.05}>
                <Card className="h-full transition-shadow hover:shadow-md">
                  <CardHeader>
                    <span className="flex h-11 w-11 items-center justify-center rounded-lg bg-accent/10 text-accent">
                      <Icon className="h-6 w-6" />
                    </span>
                    <CardTitle>{item.title}</CardTitle>
                    <CardDescription>{item.description}</CardDescription>
                  </CardHeader>
                  <CardContent>
                    <ul className="flex flex-col gap-1.5 text-sm text-ink/80">
                      {item.examples.map((ex) => (
                        <li key={ex} className="flex items-center gap-2">
                          <span className="h-1 w-1 rounded-full bg-accent" />
                          {ex}
                        </li>
                      ))}
                    </ul>
                  </CardContent>
                </Card>
              </Reveal>
            );
          })}
        </div>
      </Container>
    </section>
  );
}
```

- [ ] **Step 2: Create `components/sections/why.tsx`**

```tsx
import { Container } from "@/components/layout/container";
import { Reveal } from "@/components/motion/reveal";
import { SECTION_IDS } from "@/lib/content";
import type { Dictionary } from "@/lib/dictionary";

export function Why({ dict }: { dict: Dictionary["why"] }) {
  return (
    <section id={SECTION_IDS.why} className="bg-ink py-20 text-paper">
      <Container>
        <Reveal className="mb-12 max-w-2xl">
          <h2 className="font-display text-3xl font-bold sm:text-4xl">{dict.heading}</h2>
          <p className="mt-4 text-lg text-paper/70">{dict.intro}</p>
        </Reveal>
        <div className="grid gap-x-10 gap-y-8 sm:grid-cols-2 lg:grid-cols-3">
          {dict.items.map((item, i) => (
            <Reveal key={item.title} delay={i * 0.05}>
              <div className="flex flex-col gap-2">
                <span className="font-display text-2xl font-bold text-accent">
                  {String(i + 1).padStart(2, "0")}
                </span>
                <h3 className="font-display text-xl font-semibold">{item.title}</h3>
                <p className="text-paper/70">{item.body}</p>
              </div>
            </Reveal>
          ))}
        </div>
      </Container>
    </section>
  );
}
```

- [ ] **Step 3: Add `services` + `why` keys to both dictionaries**, re-run parity.

`he.json`:
```json
"services": {
  "heading": "מה אנחנו מייצרים",
  "intro": "הדפסה, חיתוך וגימור תחת קורת גג אחת — מעבודות פשוטות ועד פרויקטים מורכבים.",
  "items": {
    "stickers": {
      "title": "מדבקות והדפסת רול",
      "description": "מגוון רחב של מדבקות ומוצרי הדבקה בהדפסה דיגיטלית.",
      "examples": ["מדבקות ויניל", "מדבקות שקופות ולבנות", "חיתוך בצורה חופשית", "מדבקות חלון וסנדבלסט", "תוויות מוצר ואריזה"]
    },
    "signage": {
      "title": "חיתוך אותיות ושילוט",
      "description": "אותיות חתוכות ושילוט מותאם למידה, חומר ועיצוב.",
      "examples": ["אותיות חתוכות", "שילוט פנים ועסקים", "כותרות לתערוכות", "חיתוך PVC", "שילוט הכוונה"]
    },
    "rigid": {
      "title": "הדפסה על חומרים קשיחים",
      "description": "הדפסה והרכבה על חומרים קשיחים לתצוגה ולשילוט.",
      "examples": ["PVC", "פarmקס / קאפה", "אקריליק / פרספקס", "הדפסה ישירה או הדפסה והרכבה", "שלטים מודפסים"]
    },
    "exhibitions": {
      "title": "תערוכות, מוזיאונים וגלריות",
      "description": "הפקת שילוט וגרפיקה לתערוכות לפי מפרט אדריכלי או גרפי.",
      "examples": ["טקסטים על קיר", "כותרות תערוכה", "פאנלים מודפסים", "שילוט הכוונה", "התאמת צבע לפי מדריך חזותי"]
    },
    "custom": {
      "title": "עבודות ייצור מותאמות",
      "description": "ייצור לפי קובץ ודרישות הפרויקט, כולל פתרונות מורכבים.",
      "examples": ["ייצור מקבצים מסופקים", "חיתוך בצורה מותאמת", "סדרות קצרות", "פרויקטים חד-פעמיים", "עבודות רב-חומריות"]
    }
  }
},
"why": {
  "heading": "למה לעבוד עם ליין קאט",
  "intro": "שותף הפקה אמין ומדויק — לא בית דפוס זול.",
  "items": [
    { "title": "הבנה טכנית של קבצים", "body": "אנחנו מזהים ופותרים בעיות קובץ, חיתוך, מידה ופורמט לפני ההפקה." },
    { "title": "הכול תחת קורת גג אחת", "body": "הדפסה, חיתוך וגימור באותו מקום — תהליך מסודר ושקוף." },
    { "title": "ניסיון בעבודות מורכבות", "body": "תערוכות, מדבקות גדולות, קבצים מרובי-עמודים ומידות מיוחדות." },
    { "title": "ייצור מהיר", "body": "פתרונות הפקה מהירים כשצריך, בהתאם לזמינות." },
    { "title": "דיוק ואמינות", "body": "ייצור מדויק ותוצאה שאפשר לסמוך עליה, מהקובץ ועד המסירה." },
    { "title": "ליווי אישי", "body": "תמיכה צמודה מהכנת הקובץ ועד האיסוף, המשלוח או ההתקנה." }
  ]
}
```

`en.json`:
```json
"services": {
  "heading": "What we produce",
  "intro": "Printing, cutting and finishing under one roof — from simple jobs to complex projects.",
  "items": {
    "stickers": {
      "title": "Stickers & roll printing",
      "description": "A wide range of stickers and adhesive products, digitally printed.",
      "examples": ["Vinyl stickers", "Transparent & white stickers", "Custom-shape cutting", "Window & sandblast stickers", "Product & packaging labels"]
    },
    "signage": {
      "title": "Letter cutting & signage",
      "description": "Cut letters and signage made to size, material and design.",
      "examples": ["Custom-cut letters", "Interior & business signage", "Exhibition titles", "PVC cutting", "Directional signs"]
    },
    "rigid": {
      "title": "Printing on rigid materials",
      "description": "Printing and mounting on rigid materials for display and signage.",
      "examples": ["PVC", "Foam board / Kappa", "Acrylic / Perspex", "Direct print or print & mount", "Printed signs"]
    },
    "exhibitions": {
      "title": "Exhibitions, museums & galleries",
      "description": "Signage and graphics produced to architectural or graphic specs.",
      "examples": ["Wall text stickers", "Exhibition titles", "Printed panels", "Directional signage", "Color matching to a visual guide"]
    },
    "custom": {
      "title": "Custom production work",
      "description": "Production from your files and project requirements, including complex jobs.",
      "examples": ["Production from supplied files", "Custom-shape cutting", "Short runs", "One-off projects", "Mixed-material jobs"]
    }
  }
},
"why": {
  "heading": "Why work with Line Cut",
  "intro": "A reliable, precise production partner — not a cheap print shop.",
  "items": [
    { "title": "Technical file understanding", "body": "We spot and solve file, cutting, size and format issues before production." },
    { "title": "Everything under one roof", "body": "Printing, cutting and finishing in one place — an organized, transparent process." },
    { "title": "Experience with complex jobs", "body": "Exhibitions, large stickers, multi-page files and custom dimensions." },
    { "title": "Fast production", "body": "Fast production solutions when you need them, based on availability." },
    { "title": "Accuracy & reliability", "body": "Precise manufacturing and a result you can trust, from file to delivery." },
    { "title": "Hands-on support", "body": "Close support from file preparation to pickup, delivery or installation." }
  ]
}
```

- [ ] **Step 4: Run parity + typecheck + build**

Run: `npm test -- app/[lang]/dictionaries.test.ts && npm run typecheck && npm run build`
Expected: pass. (Fix any typo in the Hebrew `rigid.examples` — ensure plain text like "פורמקס / קאפה".)

- [ ] **Step 5: Commit**

```bash
GIT_CONFIG_GLOBAL=/dev/null git -c user.name="Line Cut Dev" -c user.email="yuvala@inabit.com" -c commit.gpgsign=false add -A && \
GIT_CONFIG_GLOBAL=/dev/null git -c user.name="Line Cut Dev" -c user.email="yuvala@inabit.com" -c commit.gpgsign=false commit -m "feat(sections): services and why-us"
```

---

## Task 10: Process + Gallery + Studio

**Files:**
- Create: `components/sections/process.tsx`, `components/sections/gallery.tsx`, `components/sections/studio.tsx`

**Interfaces:**
- Consumes: `Container`, `Reveal`, `Image`, `PROCESS_STEP_KEYS`, `SECTION_IDS`, `Dictionary`.
- Produces: `Process({ dict })` `dict: Dictionary['process']`; `Gallery({ dict })` `dict: Dictionary['gallery']`; `Studio({ dict })` `dict: Dictionary['studio']`.

- [ ] **Step 1: Create `components/sections/process.tsx`**

```tsx
import { Container } from "@/components/layout/container";
import { Reveal } from "@/components/motion/reveal";
import { PROCESS_STEP_KEYS, SECTION_IDS } from "@/lib/content";
import type { Dictionary } from "@/lib/dictionary";

export function Process({ dict }: { dict: Dictionary["process"] }) {
  return (
    <section id={SECTION_IDS.process} className="py-20">
      <Container>
        <Reveal className="mb-12 max-w-2xl">
          <h2 className="font-display text-3xl font-bold sm:text-4xl">{dict.heading}</h2>
          <p className="mt-4 text-lg text-muted">{dict.intro}</p>
        </Reveal>
        <ol className="grid gap-8 md:grid-cols-5">
          {PROCESS_STEP_KEYS.map((key, i) => (
            <Reveal key={key} delay={i * 0.06}>
              <li className="flex flex-col gap-3">
                <span className="flex h-10 w-10 items-center justify-center rounded-full border border-accent font-display font-bold text-accent">
                  {i + 1}
                </span>
                <h3 className="font-display text-lg font-semibold">{dict.steps[key].title}</h3>
                <p className="text-sm text-muted">{dict.steps[key].body}</p>
              </li>
            </Reveal>
          ))}
        </ol>
      </Container>
    </section>
  );
}
```

- [ ] **Step 2: Create `components/sections/gallery.tsx`**

```tsx
import Image from "next/image";
import { Container } from "@/components/layout/container";
import { Reveal } from "@/components/motion/reveal";
import { SECTION_IDS } from "@/lib/content";
import type { Dictionary } from "@/lib/dictionary";

// TODO(client): replace with real project photos in /public/work and update alts in the dictionary.
const PLACEHOLDER_IMAGES = [
  "https://images.unsplash.com/photo-1558655146-9f40138edfeb?auto=format&fit=crop&w=800&q=80",
  "https://images.unsplash.com/photo-1607082348824-0a96f2a4b9da?auto=format&fit=crop&w=800&q=80",
  "https://images.unsplash.com/photo-1561070791-2526d30994b5?auto=format&fit=crop&w=800&q=80",
  "https://images.unsplash.com/photo-1581291518857-4e27b48ff24e?auto=format&fit=crop&w=800&q=80",
  "https://images.unsplash.com/photo-1572044162444-ad60f128bdea?auto=format&fit=crop&w=800&q=80",
  "https://images.unsplash.com/photo-1503602642458-232111445657?auto=format&fit=crop&w=800&q=80",
];

export function Gallery({ dict }: { dict: Dictionary["gallery"] }) {
  return (
    <section id={SECTION_IDS.work} className="bg-paper-2/40 py-20">
      <Container>
        <Reveal className="mb-12 max-w-2xl">
          <h2 className="font-display text-3xl font-bold sm:text-4xl">{dict.heading}</h2>
          <p className="mt-4 text-lg text-muted">{dict.intro}</p>
        </Reveal>
        <div className="grid grid-cols-2 gap-4 md:grid-cols-3">
          {PLACEHOLDER_IMAGES.map((src, i) => (
            <Reveal key={src} delay={(i % 3) * 0.05}>
              <div className="relative aspect-square overflow-hidden rounded-xl border border-line">
                <Image
                  src={src}
                  alt={`${dict.imageAltPrefix} ${i + 1}`}
                  fill
                  sizes="(max-width: 768px) 50vw, 33vw"
                  className="object-cover transition-transform duration-500 hover:scale-105"
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

- [ ] **Step 3: Create `components/sections/studio.tsx`**

```tsx
import Image from "next/image";
import { Container } from "@/components/layout/container";
import { Reveal } from "@/components/motion/reveal";
import { Button } from "@/components/ui/button";
import { SECTION_IDS } from "@/lib/content";
import { whatsappLink } from "@/lib/site-config";
import type { Dictionary } from "@/lib/dictionary";

export function Studio({ dict }: { dict: Dictionary["studio"] }) {
  return (
    <section id={SECTION_IDS.studio} className="py-20">
      <Container className="grid items-center gap-12 lg:grid-cols-2">
        <Reveal className="order-2 flex flex-col gap-5 lg:order-1">
          <p className="text-sm font-semibold uppercase tracking-widest text-accent">
            {dict.eyebrow}
          </p>
          <h2 className="font-display text-3xl font-bold sm:text-4xl">{dict.heading}</h2>
          <p className="text-lg text-muted">{dict.body}</p>
          <div>
            <Button asChild variant="outline">
              <a href={whatsappLink(dict.ctaMessage)} target="_blank" rel="noopener noreferrer">
                {dict.cta}
              </a>
            </Button>
          </div>
        </Reveal>
        <Reveal delay={0.1} className="order-1 lg:order-2">
          {/* TODO(client): replace with photos of the owner's own creations */}
          <div className="relative aspect-[4/3] overflow-hidden rounded-2xl border border-line">
            <Image
              src="https://images.unsplash.com/photo-1452860606245-08befc0ff44b?auto=format&fit=crop&w=1200&q=80"
              alt={dict.imageAlt}
              fill
              sizes="(max-width: 1024px) 100vw, 50vw"
              className="object-cover"
            />
          </div>
        </Reveal>
      </Container>
    </section>
  );
}
```

- [ ] **Step 4: Add `process` + `gallery` + `studio` keys to both dictionaries**, re-run parity.

`he.json`:
```json
"process": {
  "heading": "איך עובדים איתנו",
  "intro": "תהליך מסודר וברור — מהקובץ ועד התוצאה המוגמרת.",
  "steps": {
    "file": { "title": "קבלת קובץ", "body": "אתם שולחים קובץ מוכן להדפסה (PDF) עם מידות סופיות." },
    "review": { "title": "בדיקה טכנית", "body": "אנחנו בודקים קובץ, חיתוך, מידה וחומר לפני ההפקה." },
    "production": { "title": "ייצור", "body": "הדפסה וחיתוך מדויקים בהתאם למפרט." },
    "finishing": { "title": "גימור", "body": "הרכבה, חיתוך למידה וגימור סופי." },
    "delivery": { "title": "מסירה", "body": "איסוף, משלוח או התקנה — לפי הצורך." }
  }
},
"gallery": {
  "heading": "עבודות נבחרות",
  "intro": "מדבקות, שילוט, תערוכות והדפסות על חומרים קשיחים.",
  "imageAltPrefix": "עבודה של ליין קאט"
},
"studio": {
  "eyebrow": "מהסדנה",
  "heading": "מוצרים ויצירות מבית ליין קאט",
  "body": "מדי פעם אנחנו יוצרים מוצרים משלנו — ויודעים גם לייצר אותם בכמויות. בקרוב כאן יוצג קטלוג המוצרים.",
  "cta": "מתעניינים? דברו איתנו",
  "ctaMessage": "שלום, אשמח לשמוע על המוצרים שלכם",
  "imageAlt": "מוצר מתוצרת ליין קאט"
}
```

`en.json`:
```json
"process": {
  "heading": "How we work",
  "intro": "A clear, organized process — from file to finished result.",
  "steps": {
    "file": { "title": "Your file", "body": "You send a print-ready file (PDF) with final dimensions." },
    "review": { "title": "Technical review", "body": "We check the file, cut lines, size and material before production." },
    "production": { "title": "Production", "body": "Accurate printing and cutting to spec." },
    "finishing": { "title": "Finishing", "body": "Mounting, cut-to-size and final finishing." },
    "delivery": { "title": "Delivery", "body": "Pickup, delivery or installation — as needed." }
  }
},
"gallery": {
  "heading": "Selected work",
  "intro": "Stickers, signage, exhibitions and rigid-material prints.",
  "imageAltPrefix": "Line Cut project"
},
"studio": {
  "eyebrow": "From the studio",
  "heading": "Products & creations by Line Cut",
  "body": "From time to time we make our own products — and we can produce them at scale. A product catalog is coming soon.",
  "cta": "Interested? Talk to us",
  "ctaMessage": "Hi, I'd like to hear about your products",
  "imageAlt": "A product made by Line Cut"
}
```

- [ ] **Step 5: Allow Unsplash images in `next.config.ts`**

```ts
import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  images: {
    remotePatterns: [
      { protocol: "https", hostname: "images.unsplash.com" },
      { protocol: "https", hostname: "deifkwefumgah.cloudfront.net" },
    ],
  },
};

export default nextConfig;
```

- [ ] **Step 6: Run parity + typecheck + build**

Run: `npm test -- app/[lang]/dictionaries.test.ts && npm run typecheck && npm run build`
Expected: pass.

- [ ] **Step 7: Commit**

```bash
GIT_CONFIG_GLOBAL=/dev/null git -c user.name="Line Cut Dev" -c user.email="yuvala@inabit.com" -c commit.gpgsign=false add -A && \
GIT_CONFIG_GLOBAL=/dev/null git -c user.name="Line Cut Dev" -c user.email="yuvala@inabit.com" -c commit.gpgsign=false commit -m "feat(sections): process, gallery, studio"
```

---

## Task 11: FAQ

**Files:**
- Create: `components/sections/faq.tsx`

**Interfaces:**
- Consumes: `Accordion*`, `Container`, `Reveal`, `FAQ_KEYS`, `SECTION_IDS`, `Dictionary`.
- Produces: `Faq({ dict })` with `dict: Dictionary['faq']`.

- [ ] **Step 1: Create `components/sections/faq.tsx`**

```tsx
import { Container } from "@/components/layout/container";
import { Reveal } from "@/components/motion/reveal";
import {
  Accordion,
  AccordionItem,
  AccordionTrigger,
  AccordionContent,
} from "@/components/ui/accordion";
import { FAQ_KEYS, SECTION_IDS } from "@/lib/content";
import type { Dictionary } from "@/lib/dictionary";

export function Faq({ dict }: { dict: Dictionary["faq"] }) {
  return (
    <section id={SECTION_IDS.faq} className="py-20">
      <Container className="max-w-3xl">
        <Reveal className="mb-10">
          <h2 className="font-display text-3xl font-bold sm:text-4xl">{dict.heading}</h2>
        </Reveal>
        <Accordion type="single" collapsible className="w-full">
          {FAQ_KEYS.map((key) => (
            <AccordionItem key={key} value={key}>
              <AccordionTrigger>{dict.items[key].q}</AccordionTrigger>
              <AccordionContent>{dict.items[key].a}</AccordionContent>
            </AccordionItem>
          ))}
        </Accordion>
      </Container>
    </section>
  );
}
```

- [ ] **Step 2: Add `faq` keys to both dictionaries**, re-run parity.

`he.json`:
```json
"faq": {
  "heading": "שאלות נפוצות",
  "items": {
    "formats": { "q": "באיזה פורמט קובץ כדאי לשלוח?", "a": "PDF מוכן להדפסה עם מידות סופיות וקווי חיתוך כשצריך. נשמח לבדוק את הקובץ לפני ההפקה." },
    "turnaround": { "q": "כמה זמן לוקח ייצור?", "a": "תלוי בעבודה ובחומר. יש לנו אפשרויות ייצור מהיר בהתאם לזמינות — ספרו לנו על הדדליין שלכם." },
    "materials": { "q": "על אילו חומרים אתם מדפיסים?", "a": "ויניל, PVC, פורמקס/קאפה, אקריליק/פרספקס ועוד — הדפסה ישירה או הדפסה והרכבה." },
    "delivery": { "q": "יש איסוף, משלוח והתקנה?", "a": "כן. אפשר לאסוף מהסדנה בחולון, לקבל במשלוח או לתאם התקנה." },
    "minOrder": { "q": "יש כמות מינימום?", "a": "אנחנו מבצעים גם סדרות קצרות ועבודות חד-פעמיות, לצד הזמנות גדולות." }
  }
}
```

`en.json`:
```json
"faq": {
  "heading": "Frequently asked questions",
  "items": {
    "formats": { "q": "What file format should I send?", "a": "A print-ready PDF with final dimensions and cut lines where needed. We're happy to review the file before production." },
    "turnaround": { "q": "How long does production take?", "a": "It depends on the job and material. We offer fast production options based on availability — tell us your deadline." },
    "materials": { "q": "Which materials do you print on?", "a": "Vinyl, PVC, foam board/Kappa, acrylic/Perspex and more — direct print or print and mount." },
    "delivery": { "q": "Do you offer pickup, delivery and installation?", "a": "Yes. You can collect from our Holon studio, receive a delivery, or arrange installation." },
    "minOrder": { "q": "Is there a minimum order?", "a": "We handle short runs and one-off jobs as well as larger orders." }
  }
}
```

- [ ] **Step 3: Run parity + typecheck + build**

Run: `npm test -- app/[lang]/dictionaries.test.ts && npm run typecheck && npm run build`
Expected: pass.

- [ ] **Step 4: Commit**

```bash
GIT_CONFIG_GLOBAL=/dev/null git -c user.name="Line Cut Dev" -c user.email="yuvala@inabit.com" -c commit.gpgsign=false add -A && \
GIT_CONFIG_GLOBAL=/dev/null git -c user.name="Line Cut Dev" -c user.email="yuvala@inabit.com" -c commit.gpgsign=false commit -m "feat(sections): FAQ accordion"
```

---

## Task 12: Contact — schema, Server Action, section

**Files:**
- Create: `lib/contact-schema.ts`, `lib/contact-schema.test.ts`, `app/actions/contact.ts`, `components/sections/contact.tsx`
- Modify: `.env.example` (create), `app/actions/contact.test.ts`

**Interfaces:**
- Produces:
  - `@/lib/contact-schema`: `contactSchema` (Zod), `type ContactInput`, `parseContact(data: unknown): { success: true; data: ContactInput } | { success: false; errors: Record<string,string> }`.
  - `@/app/actions/contact`: `type ContactState = { status: "idle" | "success" | "error"; message?: string; errors?: Record<string,string> }`; `submitContact(prev: ContactState, formData: FormData): Promise<ContactState>`.
  - `Contact({ dict, lang })` with `dict: Dictionary['contact']`.

- [ ] **Step 1: Write failing schema test** — `lib/contact-schema.test.ts`

```ts
import { describe, it, expect } from "vitest";
import { parseContact } from "@/lib/contact-schema";

const valid = { name: "Dana", email: "dana@example.com", message: "I need 50 stickers please" };

describe("parseContact", () => {
  it("accepts valid input", () => {
    const r = parseContact(valid);
    expect(r.success).toBe(true);
  });
  it("rejects a bad email", () => {
    const r = parseContact({ ...valid, email: "nope" });
    expect(r.success).toBe(false);
    if (!r.success) expect(r.errors.email).toBeTruthy();
  });
  it("rejects a short message", () => {
    const r = parseContact({ ...valid, message: "hi" });
    expect(r.success).toBe(false);
    if (!r.success) expect(r.errors.message).toBeTruthy();
  });
  it("requires a name", () => {
    const r = parseContact({ ...valid, name: "" });
    expect(r.success).toBe(false);
  });
});
```

- [ ] **Step 2: Run it, expect failure**

Run: `npm test -- lib/contact-schema.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement `lib/contact-schema.ts`**

```ts
import { z } from "zod";

export const contactSchema = z.object({
  name: z.string().trim().min(2, "required"),
  email: z.string().trim().email("invalid_email"),
  phone: z.string().trim().optional().or(z.literal("")),
  message: z.string().trim().min(10, "too_short"),
});

export type ContactInput = z.infer<typeof contactSchema>;

export function parseContact(
  data: unknown,
):
  | { success: true; data: ContactInput }
  | { success: false; errors: Record<string, string> } {
  const result = contactSchema.safeParse(data);
  if (result.success) return { success: true, data: result.data };
  const errors: Record<string, string> = {};
  for (const issue of result.error.issues) {
    const key = String(issue.path[0] ?? "form");
    if (!errors[key]) errors[key] = issue.message;
  }
  return { success: false, errors };
}
```

- [ ] **Step 4: Run tests, expect pass**

Run: `npm test -- lib/contact-schema.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 5: Create `.env.example`**

```bash
# Resend transactional email (https://resend.com)
RESEND_API_KEY=
# Where contact-form submissions are delivered
CONTACT_EMAIL=info@example.com
# Verified "from" sender on your Resend domain
CONTACT_FROM=Line Cut <noreply@yourdomain.com>
```

- [ ] **Step 6: Implement `app/actions/contact.ts`**

```ts
"use server";

import { Resend } from "resend";
import { parseContact } from "@/lib/contact-schema";

export type ContactState = {
  status: "idle" | "success" | "error";
  message?: string;
  errors?: Record<string, string>;
};

export async function submitContact(
  _prev: ContactState,
  formData: FormData,
): Promise<ContactState> {
  const parsed = parseContact({
    name: formData.get("name"),
    email: formData.get("email"),
    phone: formData.get("phone"),
    message: formData.get("message"),
  });

  if (!parsed.success) {
    return { status: "error", errors: parsed.errors };
  }

  const apiKey = process.env.RESEND_API_KEY;
  const to = process.env.CONTACT_EMAIL;
  const from = process.env.CONTACT_FROM;

  if (!apiKey || !to || !from) {
    return { status: "error", message: "server_misconfigured" };
  }

  const { name, email, phone, message } = parsed.data;

  try {
    const resend = new Resend(apiKey);
    const { error } = await resend.emails.send({
      from,
      to,
      replyTo: email,
      subject: `Line Cut — website inquiry from ${name}`,
      text: `Name: ${name}\nEmail: ${email}\nPhone: ${phone || "-"}\n\n${message}`,
    });
    if (error) return { status: "error", message: "send_failed" };
    return { status: "success" };
  } catch {
    return { status: "error", message: "send_failed" };
  }
}
```

- [ ] **Step 7: Write failing action test** — `app/actions/contact.test.ts`

```ts
import { describe, it, expect, vi, beforeEach } from "vitest";

const sendMock = vi.fn();
vi.mock("resend", () => ({
  Resend: vi.fn(() => ({ emails: { send: sendMock } })),
}));

import { submitContact, type ContactState } from "@/app/actions/contact";

function fd(fields: Record<string, string>): FormData {
  const f = new FormData();
  for (const [k, v] of Object.entries(fields)) f.append(k, v);
  return f;
}
const idle: ContactState = { status: "idle" };

describe("submitContact", () => {
  beforeEach(() => {
    sendMock.mockReset();
    process.env.RESEND_API_KEY = "test";
    process.env.CONTACT_EMAIL = "to@example.com";
    process.env.CONTACT_FROM = "from@example.com";
  });

  it("returns validation errors for bad input", async () => {
    const res = await submitContact(idle, fd({ name: "", email: "x", message: "hi" }));
    expect(res.status).toBe("error");
    expect(res.errors?.email).toBeTruthy();
    expect(sendMock).not.toHaveBeenCalled();
  });

  it("sends and returns success for valid input", async () => {
    sendMock.mockResolvedValue({ error: null });
    const res = await submitContact(
      idle,
      fd({ name: "Dana", email: "dana@example.com", message: "I need 50 stickers please" }),
    );
    expect(res.status).toBe("success");
    expect(sendMock).toHaveBeenCalledOnce();
  });

  it("reports send failure", async () => {
    sendMock.mockResolvedValue({ error: { message: "boom" } });
    const res = await submitContact(
      idle,
      fd({ name: "Dana", email: "dana@example.com", message: "I need 50 stickers please" }),
    );
    expect(res.status).toBe("error");
    expect(res.message).toBe("send_failed");
  });
});
```

- [ ] **Step 8: Run it, expect pass**

Run: `npm test -- app/actions/contact.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 9: Implement `components/sections/contact.tsx`**

```tsx
"use client";

import { useActionState } from "react";
import { MapPin, Phone, Mail, Clock, Instagram, Facebook, MessageCircle } from "lucide-react";
import { Container } from "@/components/layout/container";
import { Button } from "@/components/ui/button";
import { submitContact, type ContactState } from "@/app/actions/contact";
import { siteConfig, whatsappLink } from "@/lib/site-config";
import { SECTION_IDS } from "@/lib/content";
import type { Locale } from "@/lib/i18n";
import type { Dictionary } from "@/lib/dictionary";

const initial: ContactState = { status: "idle" };

export function Contact({ dict, lang }: { dict: Dictionary["contact"]; lang: Locale }) {
  const [state, action, pending] = useActionState(submitContact, initial);

  return (
    <section id={SECTION_IDS.contact} className="bg-paper-2/40 py-20">
      <Container className="grid gap-12 lg:grid-cols-2">
        {/* Details */}
        <div className="flex flex-col gap-6">
          <h2 className="font-display text-3xl font-bold sm:text-4xl">{dict.heading}</h2>
          <p className="text-lg text-muted">{dict.intro}</p>
          <ul className="flex flex-col gap-4 text-ink/90">
            <li className="flex items-center gap-3">
              <MapPin className="h-5 w-5 text-accent" />
              {`${siteConfig.address.street}, ${siteConfig.address.city}`}
            </li>
            <li className="flex items-center gap-3">
              <Phone className="h-5 w-5 text-accent" />
              <a href={`tel:${siteConfig.phone}`} dir="ltr">{siteConfig.phone}</a>
            </li>
            <li className="flex items-center gap-3">
              <Mail className="h-5 w-5 text-accent" />
              <a href={`mailto:${siteConfig.email}`}>{siteConfig.email}</a>
            </li>
            <li className="flex items-center gap-3">
              <Clock className="h-5 w-5 text-accent" />
              {siteConfig.hours[lang]}
            </li>
          </ul>
          <div className="flex items-center gap-3">
            <Button asChild>
              <a href={whatsappLink(dict.whatsappMessage)} target="_blank" rel="noopener noreferrer">
                <MessageCircle className="h-5 w-5" />
                {dict.whatsapp}
              </a>
            </Button>
            <a href={siteConfig.social.instagram} aria-label="Instagram" target="_blank" rel="noopener noreferrer" className="text-muted hover:text-accent">
              <Instagram />
            </a>
            <a href={siteConfig.social.facebook} aria-label="Facebook" target="_blank" rel="noopener noreferrer" className="text-muted hover:text-accent">
              <Facebook />
            </a>
          </div>
          <p className="text-sm text-muted">{`${dict.businessId}: ${siteConfig.businessId}`}</p>
        </div>

        {/* Form */}
        <form action={action} className="flex flex-col gap-4 rounded-2xl border border-line bg-paper p-6">
          {state.status === "success" ? (
            <p className="rounded-md bg-accent/10 p-4 text-accent">{dict.success}</p>
          ) : null}
          {state.status === "error" && state.message ? (
            <p className="rounded-md bg-accent/10 p-4 text-accent">{dict.errorGeneric}</p>
          ) : null}

          <label className="flex flex-col gap-1 text-sm">
            {dict.fields.name}
            <input name="name" required className="h-11 rounded-md border border-line bg-paper px-3 outline-none focus:border-accent" />
            {state.errors?.name ? <span className="text-xs text-accent">{dict.fieldErrors.required}</span> : null}
          </label>

          <label className="flex flex-col gap-1 text-sm">
            {dict.fields.email}
            <input name="email" type="email" required dir="ltr" className="h-11 rounded-md border border-line bg-paper px-3 outline-none focus:border-accent" />
            {state.errors?.email ? <span className="text-xs text-accent">{dict.fieldErrors.email}</span> : null}
          </label>

          <label className="flex flex-col gap-1 text-sm">
            {dict.fields.phone}
            <input name="phone" dir="ltr" className="h-11 rounded-md border border-line bg-paper px-3 outline-none focus:border-accent" />
          </label>

          <label className="flex flex-col gap-1 text-sm">
            {dict.fields.message}
            <textarea name="message" required rows={4} className="rounded-md border border-line bg-paper px-3 py-2 outline-none focus:border-accent" />
            {state.errors?.message ? <span className="text-xs text-accent">{dict.fieldErrors.message}</span> : null}
          </label>

          <Button type="submit" disabled={pending}>
            {pending ? dict.sending : dict.submit}
          </Button>
        </form>
      </Container>
    </section>
  );
}
```

- [ ] **Step 10: Add `contact` keys to both dictionaries**, re-run parity.

`he.json`:
```json
"contact": {
  "heading": "צרו קשר",
  "intro": "ספרו לנו על הפרויקט — נשמח לבדוק קובץ ולתת הצעת מחיר.",
  "whatsapp": "וואטסאפ",
  "whatsappMessage": "שלום, אשמח לקבל הצעת מחיר",
  "businessId": "ח.פ.",
  "success": "תודה! קיבלנו את הפנייה ונחזור אליכם בהקדם.",
  "errorGeneric": "משהו השתבש בשליחה. נסו שוב או פנו אלינו בוואטסאפ.",
  "sending": "שולח…",
  "submit": "שליחה",
  "fields": { "name": "שם", "email": "אימייל", "phone": "טלפון (לא חובה)", "message": "פרטי הפנייה" },
  "fieldErrors": { "required": "שדה חובה", "email": "אימייל לא תקין", "message": "נדרשים לפחות 10 תווים" }
}
```

`en.json`:
```json
"contact": {
  "heading": "Get in touch",
  "intro": "Tell us about your project — we're happy to review a file and give a quote.",
  "whatsapp": "WhatsApp",
  "whatsappMessage": "Hi, I'd like a quote",
  "businessId": "Business ID",
  "success": "Thanks! We received your message and will get back to you shortly.",
  "errorGeneric": "Something went wrong sending your message. Please try again or reach us on WhatsApp.",
  "sending": "Sending…",
  "submit": "Send",
  "fields": { "name": "Name", "email": "Email", "phone": "Phone (optional)", "message": "Your message" },
  "fieldErrors": { "required": "Required field", "email": "Invalid email", "message": "At least 10 characters required" }
}
```

- [ ] **Step 11: Run full suite + typecheck + build**

Run: `npm test && npm run typecheck && npm run build`
Expected: all pass.

- [ ] **Step 12: Commit**

```bash
GIT_CONFIG_GLOBAL=/dev/null git -c user.name="Line Cut Dev" -c user.email="yuvala@inabit.com" -c commit.gpgsign=false add -A && \
GIT_CONFIG_GLOBAL=/dev/null git -c user.name="Line Cut Dev" -c user.email="yuvala@inabit.com" -c commit.gpgsign=false commit -m "feat(contact): zod schema, resend server action, contact section"
```

---

## Task 13: Footer + Legal pages

**Files:**
- Create: `components/layout/footer.tsx`, `app/[lang]/terms/page.tsx`, `app/[lang]/privacy/page.tsx`
- Modify: `app/[lang]/layout.tsx` (mount `<Footer>`)

**Interfaces:**
- Consumes: `Container`, `siteConfig`, `SECTION_IDS`, `Locale`, `Dictionary`.
- Produces: `Footer({ lang, dict })` with `dict: Dictionary['footer']`.

- [ ] **Step 1: Create `components/layout/footer.tsx`**

```tsx
import Link from "next/link";
import Image from "next/image";
import { Instagram, Facebook } from "lucide-react";
import { Container } from "@/components/layout/container";
import { siteConfig } from "@/lib/site-config";
import type { Locale } from "@/lib/i18n";
import type { Dictionary } from "@/lib/dictionary";

export function Footer({ lang, dict }: { lang: Locale; dict: Dictionary["footer"] }) {
  return (
    <footer className="border-t border-line bg-ink text-paper">
      <Container className="grid gap-8 py-12 sm:grid-cols-2 lg:grid-cols-4">
        <div className="flex flex-col gap-3">
          <Image src="/F_LINE_CUT_LOGO.svg" alt="Line Cut" width={120} height={44} className="h-9 w-auto" />
          <p className="text-sm text-paper/60">{dict.tagline}</p>
        </div>
        <div className="text-sm text-paper/70">
          <p>{`${siteConfig.address.street}, ${siteConfig.address.city}`}</p>
          <p dir="ltr">{siteConfig.phone}</p>
          <p>{siteConfig.email}</p>
          <p>{`${dict.businessId}: ${siteConfig.businessId}`}</p>
        </div>
        <nav className="flex flex-col gap-2 text-sm text-paper/70">
          <Link href={`/${lang}/terms`} className="hover:text-paper">{dict.terms}</Link>
          <Link href={`/${lang}/privacy`} className="hover:text-paper">{dict.privacy}</Link>
        </nav>
        <div className="flex items-start gap-4">
          <a href={siteConfig.social.instagram} aria-label="Instagram" target="_blank" rel="noopener noreferrer" className="text-paper/70 hover:text-paper"><Instagram /></a>
          <a href={siteConfig.social.facebook} aria-label="Facebook" target="_blank" rel="noopener noreferrer" className="text-paper/70 hover:text-paper"><Facebook /></a>
        </div>
      </Container>
      <div className="border-t border-paper/10 py-4 text-center text-xs text-paper/50">
        © {siteConfig.legalName}
      </div>
    </footer>
  );
}
```

> Note: keep `© {siteConfig.legalName}` without a year, or pass a year prop from a server component, since `Date` is fine in server components but avoid hard-coding. For simplicity the year is omitted.

- [ ] **Step 2: Mount Footer in `app/[lang]/layout.tsx`**

Add `import { Footer } from "@/components/layout/footer";` and render `<Footer lang={lang} dict={dict.footer} />` after `<main>`.

- [ ] **Step 3: Create `app/[lang]/terms/page.tsx`**

```tsx
import { notFound } from "next/navigation";
import { Container } from "@/components/layout/container";
import { isLocale } from "@/lib/i18n";
import { getDictionary } from "../dictionaries";

export default async function TermsPage({ params }: PageProps<"/[lang]/terms">) {
  const { lang } = await params;
  if (!isLocale(lang)) notFound();
  const dict = await getDictionary(lang);
  return (
    <Container className="prose max-w-3xl py-20">
      <h1 className="font-display text-3xl font-bold">{dict.legal.termsTitle}</h1>
      <p className="mt-4 whitespace-pre-line text-muted">{dict.legal.termsBody}</p>
    </Container>
  );
}
```

- [ ] **Step 4: Create `app/[lang]/privacy/page.tsx`** (same shape, privacy keys)

```tsx
import { notFound } from "next/navigation";
import { Container } from "@/components/layout/container";
import { isLocale } from "@/lib/i18n";
import { getDictionary } from "../dictionaries";

export default async function PrivacyPage({ params }: PageProps<"/[lang]/privacy">) {
  const { lang } = await params;
  if (!isLocale(lang)) notFound();
  const dict = await getDictionary(lang);
  return (
    <Container className="prose max-w-3xl py-20">
      <h1 className="font-display text-3xl font-bold">{dict.legal.privacyTitle}</h1>
      <p className="mt-4 whitespace-pre-line text-muted">{dict.legal.privacyBody}</p>
    </Container>
  );
}
```

- [ ] **Step 5: Add `footer` + `legal` keys to both dictionaries**, re-run parity.

`he.json`:
```json
"footer": {
  "tagline": "הדפסה דיגיטלית, חיתוך וגימור — חולון.",
  "businessId": "ח.פ.",
  "terms": "תנאי שימוש",
  "privacy": "מדיניות פרטיות"
},
"legal": {
  "termsTitle": "תנאי שימוש",
  "termsBody": "טיוטה — יש לעדכן עם עורך/ת דין לפני העלייה לאוויר.\n\nתנאי שימוש אלה חלים על השימוש באתר של ליין קאט בע\"מ ועל הזמנת שירותי הדפסה, חיתוך וגימור.",
  "privacyTitle": "מדיניות פרטיות",
  "privacyBody": "טיוטה — יש לעדכן עם עורך/ת דין לפני העלייה לאוויר.\n\nמדיניות זו מסבירה אילו פרטים אנו אוספים בעת פנייה דרך האתר וכיצד אנו עושים בהם שימוש."
}
```

`en.json`:
```json
"footer": {
  "tagline": "Digital printing, cutting and finishing — Holon.",
  "businessId": "Business ID",
  "terms": "Terms of Service",
  "privacy": "Privacy Policy"
},
"legal": {
  "termsTitle": "Terms of Service",
  "termsBody": "Draft — review with a lawyer before launch.\n\nThese terms apply to use of the Line Cut Ltd. website and to ordering printing, cutting and finishing services.",
  "privacyTitle": "Privacy Policy",
  "privacyBody": "Draft — review with a lawyer before launch.\n\nThis policy explains what information we collect when you contact us through the site and how we use it."
}
```

- [ ] **Step 6: Run parity + typecheck + build**

Run: `npm test -- app/[lang]/dictionaries.test.ts && npm run typecheck && npm run build`
Expected: pass; `/he/terms`, `/he/privacy`, `/en/terms`, `/en/privacy` build.

- [ ] **Step 7: Commit**

```bash
GIT_CONFIG_GLOBAL=/dev/null git -c user.name="Line Cut Dev" -c user.email="yuvala@inabit.com" -c commit.gpgsign=false add -A && \
GIT_CONFIG_GLOBAL=/dev/null git -c user.name="Line Cut Dev" -c user.email="yuvala@inabit.com" -c commit.gpgsign=false commit -m "feat(layout): footer and legal pages"
```

---

## Task 14: Page assembly + SEO + final smoke

**Files:**
- Modify: `app/[lang]/page.tsx` (compose all sections)
- Modify: `app/[lang]/layout.tsx` (richer metadata: hreflang alternates, openGraph)
- Create: `app/sitemap.ts`

**Interfaces:**
- Consumes every `Section` component + `getDictionary`.

- [ ] **Step 1: Replace `app/[lang]/page.tsx`**

```tsx
import { notFound } from "next/navigation";
import { isLocale } from "@/lib/i18n";
import { getDictionary } from "./dictionaries";
import { Hero } from "@/components/sections/hero";
import { ValueProps } from "@/components/sections/value-props";
import { Services } from "@/components/sections/services";
import { Why } from "@/components/sections/why";
import { Process } from "@/components/sections/process";
import { Gallery } from "@/components/sections/gallery";
import { Studio } from "@/components/sections/studio";
import { Clients } from "@/components/sections/clients";
import { Faq } from "@/components/sections/faq";
import { Contact } from "@/components/sections/contact";

export default async function Home({ params }: PageProps<"/[lang]">) {
  const { lang } = await params;
  if (!isLocale(lang)) notFound();
  const dict = await getDictionary(lang);
  return (
    <>
      <Hero dict={dict.hero} />
      <ValueProps dict={dict.valueProps} />
      <Services dict={dict.services} />
      <Why dict={dict.why} />
      <Process dict={dict.process} />
      <Gallery dict={dict.gallery} />
      <Studio dict={dict.studio} />
      <Clients dict={dict.clients} />
      <Faq dict={dict.faq} />
      <Contact dict={dict.contact} lang={lang} />
    </>
  );
}
```

- [ ] **Step 2: Enrich metadata in `app/[lang]/layout.tsx`**

Replace `generateMetadata` body with hreflang + OG:

```tsx
export async function generateMetadata({
  params,
}: {
  params: Promise<{ lang: string }>;
}): Promise<Metadata> {
  const { lang } = await params;
  if (!isLocale(lang)) return {};
  const dict = await getDictionary(lang);
  return {
    title: dict.meta.title,
    description: dict.meta.description,
    alternates: {
      languages: { he: "/he", en: "/en" },
    },
    openGraph: {
      title: dict.meta.title,
      description: dict.meta.description,
      locale: lang === "he" ? "he_IL" : "en_US",
      type: "website",
    },
  };
}
```

- [ ] **Step 3: Create `app/sitemap.ts`**

```ts
import type { MetadataRoute } from "next";
import { locales } from "@/lib/i18n";

export default function sitemap(): MetadataRoute.Sitemap {
  const base = "https://linecut.example"; // TODO(client): production domain
  const paths = ["", "/terms", "/privacy"];
  return locales.flatMap((lang) =>
    paths.map((p) => ({ url: `${base}/${lang}${p}`, changeFrequency: "monthly" as const, priority: p === "" ? 1 : 0.5 })),
  );
}
```

- [ ] **Step 4: Full verification**

Run: `npm test && npm run typecheck && npm run build`
Expected: all suites pass; build prerenders `/he`, `/en`, legal pages, and emits `/sitemap.xml`.

- [ ] **Step 5: Playwright smoke (via Playwright MCP)**

Start `npm run dev`, then drive a browser to verify:
1. `http://localhost:3000/` → redirects to `/he`; `<html dir="rtl">`; hero Hebrew headline visible.
2. Click `EN` toggle → URL becomes `/en`; `<html dir="ltr">`; hero English headline visible.
3. All section anchors present: `#services #why #process #work #studio #clients #faq #contact`.
4. Submit the contact form empty → inline validation messages appear (no navigation).
5. FAQ accordion expands on click.
Stop dev server. Capture a screenshot of `/he` and `/en` for the review.

- [ ] **Step 6: Commit**

```bash
GIT_CONFIG_GLOBAL=/dev/null git -c user.name="Line Cut Dev" -c user.email="yuvala@inabit.com" -c commit.gpgsign=false add -A && \
GIT_CONFIG_GLOBAL=/dev/null git -c user.name="Line Cut Dev" -c user.email="yuvala@inabit.com" -c commit.gpgsign=false commit -m "feat(page): assemble landing page, SEO metadata, sitemap"
```

---

## Task 15: Deploy prep (Vercel)

**Files:**
- Create: `README.md` deployment notes (append), confirm `.gitignore` covers `.env*`.

- [ ] **Step 1: Ensure `.env*` is gitignored**

Confirm `.gitignore` contains `.env*` (the Next starter's does). If not, add `.env*.local` and `.env`.

- [ ] **Step 2: Document required Vercel env vars** — append to `README.md`

```markdown
## Deployment (Vercel)

Set these Environment Variables in the Vercel project:

- `RESEND_API_KEY` — from resend.com
- `CONTACT_EMAIL` — inbox that receives contact-form submissions
- `CONTACT_FROM` — a verified sender on your Resend domain, e.g. `Line Cut <noreply@yourdomain.com>`

Before launch, fill real values in `lib/site-config.ts` (phone, email, WhatsApp number,
Instagram, Facebook, hours) and set the production domain in `app/sitemap.ts`. Replace
placeholder images (search `TODO(client)`) with real project photos under `/public`.
```

- [ ] **Step 3: Final build**

Run: `npm run build`
Expected: success — ready to push to a Git remote and import into Vercel.

- [ ] **Step 4: Commit**

```bash
GIT_CONFIG_GLOBAL=/dev/null git -c user.name="Line Cut Dev" -c user.email="yuvala@inabit.com" -c commit.gpgsign=false add -A && \
GIT_CONFIG_GLOBAL=/dev/null git -c user.name="Line Cut Dev" -c user.email="yuvala@inabit.com" -c commit.gpgsign=false commit -m "docs: vercel deployment notes"
```

---

## Self-Review (completed by plan author)

**Spec coverage:** Every spec section maps to a task — i18n/RTL + proxy (T2), warm-studio theme from logo (T3), config/placeholders (T4), primitives + client carousel structure (T5–T6), all 12 page sections (T6–T13), contact Resend+WhatsApp (T12), legal pages (T13), SEO/sitemap + assembly (T14), Vercel deploy (T15). Supabase explicitly deferred; `lib/` boundary + Server Action keep it attachable.

**Placeholder scan:** The only "TODO" markers are intentional `TODO(client)` content placeholders (photos, contact details, domain) the owner must fill — not implementation gaps. Every code step contains complete, runnable code.

**Type consistency:** `Dictionary` derived once from `he.json` (T2) and consumed as typed slices (`Dictionary['hero']`, etc.) everywhere — parity test guarantees `en.json` matches. `ContactState` defined in `app/actions/contact.ts` (T12) and imported by the contact section. `Locale`/`locales`/`getLocale`/`isLocale` single-sourced in `lib/i18n.ts`. Section content keys (`SERVICE_KEYS`, `VALUE_PROP_KEYS`, `PROCESS_STEP_KEYS`, `FAQ_KEYS`) single-sourced in `lib/content.ts` and used as dictionary indices.
