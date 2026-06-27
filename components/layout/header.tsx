"use client";

import { useState } from "react";
import Link from "next/link";
import Image from "next/image";
import { usePathname, useRouter } from "next/navigation";
import { LogOut, Menu, Package, ShieldCheck, ShoppingBag, Sticker, UserRound, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Container } from "@/components/layout/container";
import { CartBadge } from "@/components/store/cart-badge";
import { LanguageToggle } from "@/components/layout/language-toggle";
import { SECTION_IDS } from "@/lib/content";
import { whatsappLink } from "@/lib/site-config";
import { createBrowserSupabaseClient } from "@/lib/supabase/client";
import type { Locale } from "@/lib/i18n";
import type { Dictionary } from "@/lib/dictionary";

type HeaderUser = {
  email: string | null;
};

export function Header({
  lang,
  dict,
  authDict,
  user,
  isOwner = false,
}: {
  lang: Locale;
  dict: Dictionary["nav"];
  authDict: Dictionary["auth"];
  user: HeaderUser | null;
  isOwner?: boolean;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [signingOut, setSigningOut] = useState(false);
  const links = [
    { id: SECTION_IDS.services, label: dict.services },
    { id: SECTION_IDS.why, label: dict.why },
    { id: SECTION_IDS.process, label: dict.process },
    { id: SECTION_IDS.work, label: dict.work },
    { id: SECTION_IDS.faq, label: dict.faq },
    { id: SECTION_IDS.contact, label: dict.contact },
  ];
  const showHomeNav = pathname === `/${lang}` || pathname === `/${lang}/`;

  async function handleSignOut() {
    if (signingOut) return;
    setSigningOut(true);
    const supabase = createBrowserSupabaseClient();
    await supabase.auth.signOut();
    setOpen(false);
    router.push(`/${lang}`);
    router.refresh();
    setSigningOut(false);
  }

  function renderAuthNav() {
    return (
      <AuthNav
        lang={lang}
        dict={authDict}
        navDict={dict}
        user={user}
        isOwner={isOwner}
        onSignOut={handleSignOut}
        signingOut={signingOut}
      />
    );
  }

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

        {showHomeNav && (
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
        )}

        <div className="hidden items-center gap-3 lg:flex">
          <LanguageToggle lang={lang} />
          <Button asChild size="sm" variant="outline">
            <Link href={`/${lang}/store`}>
              <ShoppingBag className="size-4" aria-hidden="true" />
              {dict.store}
            </Link>
          </Button>
          <Button asChild size="sm" variant="outline">
            <Link href={`/${lang}/stickers`}>
              <Sticker className="size-4" aria-hidden="true" />
              {dict.stickers}
            </Link>
          </Button>
          <Button asChild size="sm">
            <a href={whatsappLink(dict.ctaMessage)} target="_blank" rel="noopener noreferrer">
              {dict.cta}
            </a>
          </Button>
          <CartBadge lang={lang} label={dict.store} />
          <div className="ms-1 border-s border-line ps-4">
            {renderAuthNav()}
          </div>
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
          {showHomeNav &&
            links.map((l) => (
              <a
                key={l.id}
                href={`#${l.id}`}
                onClick={() => setOpen(false)}
                className="text-base font-medium text-ink/80"
              >
                {l.label}
              </a>
            ))}
          {renderAuthNav()}
          <Button asChild size="sm" variant="outline" className="w-full">
            <Link href={`/${lang}/store`} onClick={() => setOpen(false)}>
              <ShoppingBag className="size-4" aria-hidden="true" />
              {dict.store}
            </Link>
          </Button>
          <Button asChild size="sm" variant="outline" className="w-full">
            <Link href={`/${lang}/stickers`} onClick={() => setOpen(false)}>
              <Sticker className="size-4" aria-hidden="true" />
              {dict.stickers}
            </Link>
          </Button>
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

function AuthNav({
  lang,
  dict,
  navDict,
  user,
  isOwner,
  onSignOut,
  signingOut,
}: {
  lang: Locale;
  dict: Dictionary["auth"];
  navDict: Dictionary["nav"];
  user: HeaderUser | null;
  isOwner: boolean;
  onSignOut: () => void;
  signingOut: boolean;
}) {
  const [menuOpen, setMenuOpen] = useState(false);

  if (!user) {
    return (
      <div className="relative">
        <button
          type="button"
          onClick={() => setMenuOpen((value) => !value)}
          className="grid size-11 cursor-pointer place-items-center rounded-full border border-ink/10 bg-paper text-ink shadow-sm transition-colors duration-200 hover:border-accent/40 hover:bg-paper-2 hover:text-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:ring-offset-paper lg:size-10"
          aria-expanded={menuOpen}
          aria-label={dict.accountMenu}
        >
          <UserRound className="size-5 lg:size-4" aria-hidden="true" />
        </button>

        {menuOpen && (
          <div className="mt-3 min-w-56 overflow-hidden rounded-2xl border border-ink/10 bg-paper p-2 shadow-xl lg:absolute lg:end-0 lg:top-full lg:z-50">
            <Link
              href={`/${lang}/login`}
              className="block rounded-xl px-3 py-2.5 text-sm font-semibold text-ink transition-colors hover:bg-paper-2 hover:text-accent"
              onClick={() => setMenuOpen(false)}
            >
              {dict.login.submit}
            </Link>
            <Link
              href={`/${lang}/signup`}
              className="mt-1 block rounded-xl bg-ink px-3 py-2.5 text-sm font-semibold text-paper transition-colors hover:bg-accent"
              onClick={() => setMenuOpen(false)}
            >
              {dict.signup.submit}
            </Link>
          </div>
        )}
      </div>
    );
  }

  const email = user.email ?? "";
  const initial = email.trim().charAt(0).toUpperCase() || "U";

  return (
    <div className="relative w-full lg:w-auto">
      <button
        type="button"
        onClick={() => setMenuOpen((value) => !value)}
        className="group/profile relative grid size-11 cursor-pointer place-items-center rounded-full bg-ink text-sm font-black text-paper shadow-md ring-1 ring-ink/10 transition-colors duration-200 hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:ring-offset-paper lg:size-10 lg:text-xs"
        aria-expanded={menuOpen}
        aria-label={dict.accountMenu}
      >
        {initial}
        <span
          className="absolute end-0.5 top-0.5 size-2.5 rounded-full border-2 border-paper bg-accent opacity-90"
          aria-hidden="true"
        />
      </button>

      {menuOpen && (
        <div className="mt-3 min-w-72 overflow-hidden rounded-2xl border border-ink/10 bg-paper shadow-xl lg:absolute lg:end-0 lg:top-full lg:z-50">
          <div className="flex items-center gap-3 border-b border-line bg-paper-2 px-4 py-3">
            <span
              className="grid size-9 shrink-0 place-items-center rounded-full bg-ink text-xs font-black text-paper"
              aria-hidden="true"
            >
              {initial}
            </span>
            <bdi className="block min-w-0 truncate text-sm font-bold text-ink" dir="ltr">
              {email}
            </bdi>
          </div>
          <div className="flex flex-col gap-1 p-2">
          <Link
            href={`/${lang}/account/orders`}
            className="flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-semibold text-ink transition-colors hover:bg-paper-2 hover:text-accent"
            onClick={() => setMenuOpen(false)}
          >
            <Package className="size-4 text-muted" aria-hidden="true" />
            {dict.ordersLink}
          </Link>
          {isOwner && (
            <Link
              href={`/${lang}/admin/orders`}
              className="flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-semibold text-ink transition-colors hover:bg-paper-2 hover:text-accent"
              onClick={() => setMenuOpen(false)}
            >
              <ShieldCheck className="size-4 text-muted" aria-hidden="true" />
              {navDict.admin}
            </Link>
          )}
          <button
            type="button"
            onClick={onSignOut}
            disabled={signingOut}
            className="flex cursor-pointer items-center gap-3 rounded-xl px-3 py-2.5 text-start text-sm font-semibold text-muted transition-colors hover:bg-accent/5 hover:text-accent disabled:cursor-not-allowed disabled:opacity-60"
          >
            <LogOut className="size-4" aria-hidden="true" />
            {dict.signOut}
          </button>
          </div>
        </div>
      )}
    </div>
  );
}
