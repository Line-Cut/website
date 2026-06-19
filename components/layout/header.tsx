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
