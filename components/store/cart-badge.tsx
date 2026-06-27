"use client";

import Link from "next/link";
import { ShoppingBag } from "lucide-react";
import { useOptionalCart } from "@/components/store/cart-provider";

export function CartBadge({ lang, label }: { lang: string; label: string }) {
  const cart = useOptionalCart();
  const count = cart?.count ?? 0;
  const show = (cart?.hydrated ?? false) && count > 0;

  return (
    <Link
      href={`/${lang}/store/cart`}
      aria-label={label}
      className="relative grid size-10 place-items-center rounded-full text-ink transition-colors hover:text-accent"
    >
      <ShoppingBag className="size-5" aria-hidden="true" />
      {show && (
        <span
          dir="ltr"
          className="absolute -end-0.5 -top-0.5 grid min-w-5 place-items-center rounded-full bg-accent px-1 text-xs font-bold text-paper tabular-nums"
        >
          {count}
        </span>
      )}
    </Link>
  );
}
