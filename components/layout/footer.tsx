import Link from "next/link";
import Image from "next/image";
import { InstagramIcon, FacebookIcon } from "@/components/ui/social-icons";
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
          <a href={siteConfig.social.instagram} aria-label="Instagram" target="_blank" rel="noopener noreferrer" className="text-paper/70 hover:text-paper"><InstagramIcon /></a>
          <a href={siteConfig.social.facebook} aria-label="Facebook" target="_blank" rel="noopener noreferrer" className="text-paper/70 hover:text-paper"><FacebookIcon /></a>
        </div>
      </Container>
      <div className="border-t border-paper/10 py-4 text-center text-xs text-paper/50">
        © {siteConfig.legalName}
      </div>
    </footer>
  );
}
