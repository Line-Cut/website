"use client";

import { useEffect, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Minus, Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { formatMoney } from "@/lib/stickers/format";
import { useCart, toServerItems } from "@/components/store/cart-provider";
import { quoteStoreCart } from "@/app/actions/store";
import { MAX_CART_QUANTITY } from "@/lib/store/pricing";
import type { Dictionary } from "@/lib/dictionary";
import type { Locale } from "@/lib/i18n";

type Quote = { total: number; currency: string; removed: string[] };

export function CartView({ dict, lang }: { dict: Dictionary["store"]; lang: Locale }) {
  const router = useRouter();
  const { items, hydrated, setQuantity, remove, removeByProductIds } = useCart();
  const [quote, setQuote] = useState<Quote | null>(null);
  const [loading, setLoading] = useState(false);
  const [showRemovedNote, setShowRemovedNote] = useState(false);

  useEffect(() => {
    if (!hydrated || items.length === 0) {
      setQuote(null);
      return;
    }
    let cancelled = false;
    setLoading(true);
    quoteStoreCart(toServerItems(items), lang).then((res) => {
      if (cancelled) return;
      setLoading(false);
      if (res.ok) {
        setQuote({ total: res.total, currency: res.currency, removed: res.removed });
        if (res.removed.length) {
          setShowRemovedNote(true);
          removeByProductIds(res.removed);
        }
      }
    });
    return () => {
      cancelled = true;
    };
  }, [items, hydrated, lang, removeByProductIds]);

  if (!hydrated) return null;

  if (items.length === 0) {
    return (
      <div className="rounded-lg border border-line bg-paper p-8 text-center">
        <p className="mb-4 text-muted">{dict.cart.empty}</p>
        <Button asChild variant="outline">
          <Link href={`/${lang}/store`}>{dict.cart.continueShopping}</Link>
        </Button>
      </div>
    );
  }

  const currency = quote?.currency ?? items[0]?.currency ?? "ILS";
  const localSum = items.reduce((s, it) => s + it.unitPrice * it.quantity, 0);
  const total = quote?.total ?? localSum;

  return (
    <div className="flex flex-col gap-6">
      {showRemovedNote && (
        <div
          role="status"
          className="rounded-md border border-accent/30 bg-accent/5 px-4 py-3 text-sm text-accent"
        >
          {dict.cart.unavailableNote}
        </div>
      )}

      <ul className="divide-y divide-line rounded-lg border border-line">
        {items.map((item, i) => (
          <li key={`${item.productId}-${i}`} className="flex items-center gap-4 p-4">
            <Link
              href={`/${lang}/store/${item.slug}`}
              className="relative size-16 shrink-0 overflow-hidden rounded-md border border-line bg-paper-2"
            >
              {item.imageUrl && (
                <Image src={item.imageUrl} alt={item.title} fill sizes="64px" className="object-cover" />
              )}
            </Link>

            <div className="min-w-0 flex-1">
              <Link
                href={`/${lang}/store/${item.slug}`}
                className="block truncate font-medium text-ink hover:text-accent"
              >
                {item.title}
              </Link>
              {Object.keys(item.selectedOptions).length > 0 && (
                <p className="truncate text-sm text-muted">
                  {Object.values(item.selectedOptions).join(" · ")}
                </p>
              )}
              <p dir="ltr" className="text-sm text-muted tabular-nums">
                {formatMoney(item.unitPrice, item.currency, lang)}
              </p>
            </div>

            <div className="flex items-center rounded-md border border-line">
              <button
                type="button"
                onClick={() => setQuantity(i, item.quantity - 1)}
                className="grid size-9 place-items-center text-ink hover:text-accent"
                aria-label={dict.cart.quantity}
              >
                <Minus className="size-4" aria-hidden="true" />
              </button>
              <span dir="ltr" className="w-9 text-center text-sm tabular-nums">
                {item.quantity}
              </span>
              <button
                type="button"
                onClick={() => setQuantity(i, item.quantity + 1)}
                disabled={item.quantity >= MAX_CART_QUANTITY}
                className="grid size-9 place-items-center text-ink hover:text-accent disabled:opacity-40"
                aria-label={dict.cart.quantity}
              >
                <Plus className="size-4" aria-hidden="true" />
              </button>
            </div>

            <button
              type="button"
              onClick={() => remove(i)}
              className="shrink-0 text-muted hover:text-accent"
              aria-label={dict.cart.remove}
            >
              <Trash2 className="size-4" aria-hidden="true" />
            </button>
          </li>
        ))}
      </ul>

      <div className="flex items-center justify-between border-t border-line pt-4">
        <span className="font-semibold text-ink">{dict.cart.total}</span>
        <span dir="ltr" className="font-display text-xl font-bold tabular-nums text-ink">
          {loading ? "…" : formatMoney(total, currency, lang)}
        </span>
      </div>

      <div className="flex flex-col gap-3 sm:flex-row sm:justify-between">
        <Button asChild variant="outline">
          <Link href={`/${lang}/store`}>{dict.cart.continueShopping}</Link>
        </Button>
        <Button
          type="button"
          variant="primary"
          onClick={() => router.push(`/${lang}/store/checkout`)}
        >
          {dict.cart.checkout}
        </Button>
      </div>
    </div>
  );
}
