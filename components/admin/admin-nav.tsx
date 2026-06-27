import Link from "next/link";
import type { Dictionary } from "@/lib/dictionary";
import type { Locale } from "@/lib/i18n";

/** Top nav shared across the admin section pages. */
export function AdminNav({
  lang,
  dict,
  current,
}: {
  lang: Locale;
  dict: Dictionary["admin"]["nav"];
  current: "products" | "orders" | "admins";
}) {
  const links = [
    { key: "products", href: `/${lang}/admin/products`, label: dict.products },
    { key: "orders", href: `/${lang}/admin/orders`, label: dict.orders },
    { key: "admins", href: `/${lang}/admin/admins`, label: dict.admins },
  ] as const;

  return (
    <nav className="flex flex-wrap gap-2 border-b border-line pb-4">
      {links.map((l) => (
        <Link
          key={l.key}
          href={l.href}
          aria-current={l.key === current ? "page" : undefined}
          className={`rounded-md px-3 py-1.5 text-sm font-medium transition-colors ${
            l.key === current ? "bg-ink text-paper" : "text-ink hover:bg-paper-2"
          }`}
        >
          {l.label}
        </Link>
      ))}
    </nav>
  );
}
