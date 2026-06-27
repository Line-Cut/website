"use client";

import { useMemo, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { Minus, Plus, Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import { formatMoney } from "@/lib/stickers/format";
import { useCart } from "@/components/store/cart-provider";
import { MAX_CART_QUANTITY } from "@/lib/store/pricing";
import type { Dictionary } from "@/lib/dictionary";
import type { Locale } from "@/lib/i18n";
import type { StoreProductView } from "@/lib/store/types";

export function ProductDetail({
  product,
  dict,
  lang,
}: {
  product: StoreProductView;
  dict: Dictionary["store"];
  lang: Locale;
}) {
  const cart = useCart();
  const [mainImage, setMainImage] = useState(product.imageUrl ?? product.images[0] ?? null);
  const [selected, setSelected] = useState<Record<string, string>>(() =>
    Object.fromEntries(product.options.map((o) => [o.key, o.choices[0]?.value ?? ""])),
  );
  const [qty, setQty] = useState(1);
  const [added, setAdded] = useState(false);

  const unitPrice = useMemo(() => {
    let p = product.price;
    for (const o of product.options) {
      const choice = o.choices.find((c) => c.value === selected[o.key]);
      if (choice) p += choice.priceDelta;
    }
    return Math.max(0, p);
  }, [product, selected]);

  const hasPrice = product.price > 0;

  function handleAdd() {
    cart.add({
      productId: product.id,
      slug: product.slug,
      quantity: qty,
      selectedOptions: selected,
      title: product.title,
      imageUrl: product.imageUrl,
      unitPrice,
      currency: product.currency,
    });
    setAdded(true);
    setTimeout(() => setAdded(false), 1600);
  }

  return (
    <div className="grid gap-8 md:grid-cols-2">
      {/* Gallery */}
      <div className="flex flex-col gap-3">
        <div className="relative aspect-square overflow-hidden rounded-lg border border-line bg-paper-2">
          {mainImage && (
            <Image
              src={mainImage}
              alt={product.title}
              fill
              sizes="(max-width: 768px) 100vw, 50vw"
              className="object-cover"
              priority
            />
          )}
        </div>
        {product.images.length > 1 && (
          <div className="flex flex-wrap gap-2">
            {product.images.map((src) => (
              <button
                key={src}
                type="button"
                onClick={() => setMainImage(src)}
                className={`relative size-16 overflow-hidden rounded-md border ${
                  src === mainImage ? "border-accent" : "border-line"
                }`}
              >
                <Image src={src} alt="" fill sizes="64px" className="object-cover" />
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Details */}
      <div className="flex flex-col gap-5">
        <h1 className="font-display text-3xl font-bold text-ink">{product.title}</h1>

        <p className="font-display text-2xl font-bold text-ink">
          {hasPrice ? (
            <span dir="ltr" className="tabular-nums">
              {formatMoney(unitPrice, product.currency, lang)}
            </span>
          ) : (
            <span className="text-base font-medium text-muted">{dict.pricePending}</span>
          )}
        </p>

        {product.description && (
          <p className="whitespace-pre-line text-muted">{product.description}</p>
        )}

        {/* Options */}
        {product.options.map((option) => (
          <fieldset key={option.key} className="flex flex-col gap-2">
            <legend className="mb-1 text-sm font-medium text-ink">{option.label}</legend>
            <div className="flex flex-wrap gap-2">
              {option.choices.map((choice) => {
                const active = selected[option.key] === choice.value;
                return (
                  <button
                    key={choice.value}
                    type="button"
                    onClick={() =>
                      setSelected((prev) => ({ ...prev, [option.key]: choice.value }))
                    }
                    className={`rounded-md border px-3 py-1.5 text-sm transition-colors ${
                      active
                        ? "border-accent bg-accent/5 text-accent"
                        : "border-line text-ink hover:border-ink/40"
                    }`}
                  >
                    {choice.label}
                    {choice.priceDelta > 0 && (
                      <span dir="ltr" className="ms-1 text-xs text-muted">
                        +{formatMoney(choice.priceDelta, product.currency, lang)}
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
          </fieldset>
        ))}

        {/* Quantity */}
        <div className="flex items-center gap-3">
          <span className="text-sm font-medium text-ink">{dict.cart.quantity}</span>
          <div className="flex items-center rounded-md border border-line">
            <button
              type="button"
              onClick={() => setQty((q) => Math.max(1, q - 1))}
              className="grid size-10 place-items-center text-ink hover:text-accent"
              aria-label={dict.cart.quantity}
            >
              <Minus className="size-4" aria-hidden="true" />
            </button>
            <span dir="ltr" className="w-10 text-center tabular-nums">
              {qty}
            </span>
            <button
              type="button"
              onClick={() => setQty((q) => Math.min(MAX_CART_QUANTITY, q + 1))}
              className="grid size-10 place-items-center text-ink hover:text-accent"
              aria-label={dict.cart.quantity}
            >
              <Plus className="size-4" aria-hidden="true" />
            </button>
          </div>
        </div>

        {/* Add to cart */}
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
          <Button type="button" variant="primary" onClick={handleAdd} className="min-h-[44px]">
            {added ? (
              <>
                <Check className="size-4" aria-hidden="true" />
                {dict.added}
              </>
            ) : (
              dict.addToCart
            )}
          </Button>
          <Link
            href={`/${lang}/store/cart`}
            className="text-sm font-medium text-accent underline underline-offset-2 hover:text-accent/80"
          >
            {dict.cart.heading}
          </Link>
        </div>
      </div>
    </div>
  );
}
