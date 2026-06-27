import "server-only";

import { createServerSupabaseClient } from "@/lib/supabase/server";
import type { Locale } from "@/lib/i18n";
import type { StoreProductView } from "@/lib/store/types";
import {
  PRODUCT_COLUMNS,
  rowToProduct,
  productToStoreView,
  type ProductRow,
} from "@/lib/store/product-row";

/**
 * Storefront reads. Use the anon-key server client: RLS exposes only
 * status='active' rows, so the public catalog is safe to read this way (no
 * admin client needed for browsing).
 */

export async function listActiveProducts(locale: Locale): Promise<StoreProductView[]> {
  const supabase = await createServerSupabaseClient();
  const { data, error } = await supabase
    .from("products")
    .select(PRODUCT_COLUMNS)
    .eq("status", "active")
    .order("sort_index", { ascending: true })
    .order("created_at", { ascending: false });

  if (error || !data) return [];
  return (data as unknown as ProductRow[]).map((row) =>
    productToStoreView(rowToProduct(row), locale),
  );
}

export async function getProductBySlug(
  slug: string,
  locale: Locale,
): Promise<StoreProductView | null> {
  const supabase = await createServerSupabaseClient();
  const { data, error } = await supabase
    .from("products")
    .select(PRODUCT_COLUMNS)
    .eq("slug", slug)
    .eq("status", "active")
    .maybeSingle();

  if (error || !data) return null;
  return productToStoreView(rowToProduct(data as unknown as ProductRow), locale);
}

/** Active product slugs, for generateStaticParams / the sitemap. */
export async function listActiveProductSlugs(): Promise<string[]> {
  const supabase = await createServerSupabaseClient();
  const { data, error } = await supabase
    .from("products")
    .select("slug")
    .eq("status", "active");
  if (error || !data) return [];
  return (data as { slug: string }[]).map((r) => r.slug);
}
