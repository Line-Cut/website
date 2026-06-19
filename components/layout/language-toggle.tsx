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
