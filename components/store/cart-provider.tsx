"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { MAX_CART_QUANTITY } from "@/lib/store/pricing";

const CART_KEY = "linecut_cart";

/**
 * A cart line. Price fields are a DISPLAY snapshot only — the server always
 * recomputes the authoritative price from the products table at quote/confirm.
 */
export type CartItem = {
  productId: string;
  slug: string;
  quantity: number;
  selectedOptions: Record<string, string>;
  title: string;
  imageUrl: string | null;
  unitPrice: number; // agorot — display only
  currency: string;
};

type CartContextValue = {
  items: CartItem[];
  count: number;
  hydrated: boolean;
  add: (item: CartItem) => void;
  remove: (index: number) => void;
  setQuantity: (index: number, qty: number) => void;
  removeByProductIds: (productIds: string[]) => void;
  clear: () => void;
};

const CartContext = createContext<CartContextValue | null>(null);

/** Stable identity for merging duplicate lines (same product + same options). */
function lineKey(item: Pick<CartItem, "productId" | "selectedOptions">): string {
  const opts = Object.keys(item.selectedOptions)
    .sort()
    .map((k) => `${k}=${item.selectedOptions[k]}`)
    .join("&");
  return `${item.productId}|${opts}`;
}

function isCartItem(x: unknown): x is CartItem {
  if (x === null || typeof x !== "object") return false;
  const o = x as Record<string, unknown>;
  return (
    typeof o.productId === "string" &&
    typeof o.slug === "string" &&
    typeof o.quantity === "number" &&
    typeof o.title === "string" &&
    typeof o.unitPrice === "number" &&
    typeof o.currency === "string" &&
    typeof o.selectedOptions === "object" &&
    o.selectedOptions !== null
  );
}

export function CartProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<CartItem[]>([]);
  const [hydrated, setHydrated] = useState(false);

  // Hydrate from localStorage after mount (avoids SSR mismatch).
  useEffect(() => {
    try {
      const raw = localStorage.getItem(CART_KEY);
      if (raw) {
        const parsed: unknown = JSON.parse(raw);
        if (Array.isArray(parsed)) setItems(parsed.filter(isCartItem));
      }
    } catch {
      /* ignore corrupt cart */
    }
    setHydrated(true);
  }, []);

  // Persist on change (only after hydration so we don't clobber storage).
  useEffect(() => {
    if (!hydrated) return;
    try {
      localStorage.setItem(CART_KEY, JSON.stringify(items));
    } catch {
      /* ignore quota errors */
    }
  }, [items, hydrated]);

  const add = useCallback((item: CartItem) => {
    setItems((prev) => {
      const key = lineKey(item);
      const idx = prev.findIndex((i) => lineKey(i) === key);
      if (idx >= 0) {
        const next = [...prev];
        next[idx] = {
          ...next[idx],
          quantity: Math.min(MAX_CART_QUANTITY, next[idx].quantity + item.quantity),
        };
        return next;
      }
      return [...prev, item];
    });
  }, []);

  const remove = useCallback((index: number) => {
    setItems((prev) => prev.filter((_, i) => i !== index));
  }, []);

  const setQuantity = useCallback((index: number, qty: number) => {
    setItems((prev) =>
      prev.map((it, i) =>
        i === index
          ? { ...it, quantity: Math.max(1, Math.min(MAX_CART_QUANTITY, Math.floor(qty) || 1)) }
          : it,
      ),
    );
  }, []);

  const removeByProductIds = useCallback((productIds: string[]) => {
    if (productIds.length === 0) return;
    const drop = new Set(productIds);
    setItems((prev) => prev.filter((it) => !drop.has(it.productId)));
  }, []);

  const clear = useCallback(() => setItems([]), []);

  const count = useMemo(
    () => items.reduce((sum, i) => sum + i.quantity, 0),
    [items],
  );

  const value = useMemo<CartContextValue>(
    () => ({ items, count, hydrated, add, remove, setQuantity, removeByProductIds, clear }),
    [items, count, hydrated, add, remove, setQuantity, removeByProductIds, clear],
  );

  return <CartContext.Provider value={value}>{children}</CartContext.Provider>;
}

export function useCart(): CartContextValue {
  const ctx = useContext(CartContext);
  if (!ctx) throw new Error("useCart must be used within CartProvider");
  return ctx;
}

/** Non-throwing variant for chrome (e.g. the header badge) that may render
 * outside the provider in isolation/tests. Returns null when absent. */
export function useOptionalCart(): CartContextValue | null {
  return useContext(CartContext);
}

/** Map cart items to the minimal server payload (price is never trusted). */
export function toServerItems(items: CartItem[]) {
  return items.map((i) => ({
    productId: i.productId,
    quantity: i.quantity,
    selectedOptions: i.selectedOptions,
  }));
}
