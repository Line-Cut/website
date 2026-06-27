import Image from "next/image";
import Link from "next/link";
import type { Product, ProductStatus } from "@/lib/store/types";
import type { Dictionary } from "@/lib/dictionary";
import type { Locale } from "@/lib/i18n";
import { formatMoney } from "@/lib/stickers/format";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

type Props = {
  products: Product[];
  dict: Dictionary["admin"]["products"];
  lang: Locale;
};

const STATUS_LABEL: Record<
  ProductStatus,
  "statusDraft" | "statusActive" | "statusArchived"
> = {
  draft: "statusDraft",
  active: "statusActive",
  archived: "statusArchived",
};

const STATUS_BADGE: Record<ProductStatus, string> = {
  active: "border-accent/30 bg-accent/5 text-accent",
  draft: "border-line text-muted",
  archived: "border-line text-muted opacity-70",
};

export function ProductAdminList({ products, dict, lang }: Props) {
  return (
    <ul className="flex flex-col gap-3">
      {products.map((p) => {
        const title = lang === "he" ? p.titleHe : p.titleEn;
        return (
          <li
            key={p.id}
            className="flex flex-wrap items-center gap-3 rounded-md border border-line bg-paper p-3 sm:gap-4"
          >
            <div className="relative h-16 w-16 shrink-0 overflow-hidden rounded-md border border-line bg-paper-2">
              {p.imageUrl ? (
                <Image
                  src={p.imageUrl}
                  alt={title}
                  fill
                  sizes="64px"
                  className="object-cover"
                />
              ) : (
                <span className="flex h-full w-full items-center justify-center px-1 text-center text-[10px] text-muted">
                  {dict.noImage}
                </span>
              )}
            </div>

            <div className="min-w-0 flex-1">
              <p className="truncate font-medium text-ink">{title}</p>
              <p className="truncate text-xs text-muted" dir="ltr">
                {p.slug}
              </p>
            </div>

            <span
              className={cn(
                "rounded-full border px-2 py-0.5 text-xs",
                STATUS_BADGE[p.status],
              )}
            >
              {dict[STATUS_LABEL[p.status]]}
            </span>

            <span className="text-sm font-medium text-ink" dir="ltr">
              {formatMoney(p.price, p.currency, lang)}
            </span>

            <Button asChild variant="outline" size="sm">
              <Link href={`/${lang}/admin/products/${p.id}/edit`}>{dict.edit}</Link>
            </Button>
          </li>
        );
      })}
    </ul>
  );
}
