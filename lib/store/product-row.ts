import type { Locale } from "@/lib/i18n";
import type {
  Product,
  ProductImage,
  ProductOption,
  ProductStatus,
  StoreProductView,
} from "@/lib/store/types";

/** Columns selected for product reads. Keep in sync with the products table. */
export const PRODUCT_COLUMNS =
  "id, slug, status, title_he, title_en, description_he, description_en, price, currency, image_url, images, options, sort_index, created_at, updated_at";

export type ProductRow = {
  id: string;
  slug: string;
  status: string;
  title_he: string;
  title_en: string;
  description_he: string | null;
  description_en: string | null;
  price: number;
  currency: string;
  image_url: string | null;
  images: unknown;
  options: unknown;
  sort_index: number;
  created_at: string;
  updated_at: string;
};

/** Pure mapper: DB row → Product. No IO, safe to import anywhere server-side. */
export function rowToProduct(row: ProductRow): Product {
  return {
    id: row.id,
    slug: row.slug,
    status: row.status as ProductStatus,
    titleHe: row.title_he,
    titleEn: row.title_en,
    descriptionHe: row.description_he ?? "",
    descriptionEn: row.description_en ?? "",
    price: row.price,
    currency: row.currency,
    imageUrl: row.image_url,
    images: Array.isArray(row.images) ? (row.images as ProductImage[]) : [],
    options: Array.isArray(row.options) ? (row.options as ProductOption[]) : [],
    sortIndex: row.sort_index,
    createdAtISO: row.created_at,
    updatedAtISO: row.updated_at,
  };
}

/** Pure mapper: Product → localized public storefront view. */
export function productToStoreView(p: Product, locale: Locale): StoreProductView {
  const he = locale === "he";
  const gallery = [p.imageUrl, ...p.images.map((i) => i.url)].filter(
    (u): u is string => Boolean(u),
  );
  return {
    id: p.id,
    slug: p.slug,
    title: he ? p.titleHe : p.titleEn,
    description: he ? p.descriptionHe : p.descriptionEn,
    price: p.price,
    currency: p.currency,
    imageUrl: p.imageUrl,
    images: gallery,
    options: p.options.map((o) => ({
      key: o.key,
      label: he ? o.labelHe : o.labelEn,
      choices: o.choices.map((c) => ({
        value: c.value,
        label: he ? c.labelHe : c.labelEn,
        priceDelta: c.priceDelta,
      })),
    })),
  };
}
