import Link from "next/link";
import Image from "next/image";
import { formatMoney } from "@/lib/stickers/format";
import type { Dictionary } from "@/lib/dictionary";
import type { Locale } from "@/lib/i18n";
import type { StoreProductView } from "@/lib/store/types";

/** Storefront product card → links to the product detail page. */
export function ProductCard({
  product,
  dict,
  lang,
}: {
  product: StoreProductView;
  dict: Dictionary["store"];
  lang: Locale;
}) {
  const hasPrice = product.price > 0;
  const hasOptions = product.options.length > 0;

  return (
    <Link
      href={`/${lang}/store/${product.slug}`}
      className="group flex flex-col overflow-hidden rounded-lg border border-line bg-paper transition-colors hover:border-ink/30"
    >
      <div className="relative aspect-[4/3] overflow-hidden bg-paper-2">
        {product.imageUrl && (
          <Image
            src={product.imageUrl}
            alt={product.title}
            fill
            sizes="(max-width: 768px) 100vw, 33vw"
            className="object-cover transition-transform duration-500 group-hover:scale-105"
          />
        )}
      </div>
      <div className="flex flex-1 flex-col gap-1 p-4">
        <h3 className="font-display text-lg font-semibold text-ink">{product.title}</h3>
        {product.description && (
          <p className="line-clamp-2 text-sm text-muted">{product.description}</p>
        )}
        <p className="mt-2 font-medium text-ink">
          {hasPrice ? (
            <>
              {hasOptions && (
                <span className="text-sm text-muted">{dict.from} </span>
              )}
              <span dir="ltr" className="tabular-nums">
                {formatMoney(product.price, product.currency, lang)}
              </span>
            </>
          ) : (
            <span className="text-sm text-muted">{dict.pricePending}</span>
          )}
        </p>
      </div>
    </Link>
  );
}
