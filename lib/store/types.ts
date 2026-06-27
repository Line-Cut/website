// =============================================================================
// Store catalog types
// Money is always in minor units (agorot) — integer arithmetic only.
// =============================================================================

export type ProductStatus = "draft" | "active" | "archived";

/** One selectable choice within a product option group (e.g. "A3"). */
export type ProductOptionChoice = {
  value: string;
  labelHe: string;
  labelEn: string;
  /** Price modifier in agorot added to the base price when chosen (may be 0). */
  priceDelta: number;
};

/** A product option group (e.g. "Size") the buyer must pick a choice from. */
export type ProductOption = {
  key: string;
  labelHe: string;
  labelEn: string;
  choices: ProductOptionChoice[];
};

export type ProductImage = {
  url: string;
  sortIndex?: number;
};

/** Full product row (admin view — both languages, all statuses). */
export type Product = {
  id: string;
  slug: string;
  status: ProductStatus;
  titleHe: string;
  titleEn: string;
  descriptionHe: string;
  descriptionEn: string;
  price: number; // agorot
  currency: string;
  imageUrl: string | null;
  images: ProductImage[];
  options: ProductOption[];
  sortIndex: number;
  createdAtISO: string;
  updatedAtISO: string;
};

/** Localized public product (storefront — one language resolved). */
export type StoreProductView = {
  id: string;
  slug: string;
  title: string;
  description: string;
  price: number; // agorot
  currency: string;
  imageUrl: string | null;
  images: string[];
  options: {
    key: string;
    label: string;
    choices: { value: string; label: string; priceDelta: number }[];
  }[];
};

/** Cart item the client sends to the server (price is NOT trusted). */
export type CartItemInput = {
  productId: string;
  quantity: number;
  /** Map of option group key → chosen choice value, e.g. { size: "a3" }. */
  selectedOptions?: Record<string, string>;
};

/**
 * A selected option snapshotted onto an order line (stored in
 * order_items.options) so the order stays renderable + bilingual even after the
 * product is archived or deleted.
 */
export type SelectedOptionSnapshot = {
  key: string;
  labelHe: string;
  labelEn: string;
  value: string;
  choiceHe: string;
  choiceEn: string;
  priceDelta: number;
};

/** A server-priced cart line (authoritative). */
export type PricedLine = {
  productId: string;
  titleHe: string;
  titleEn: string;
  imageUrl: string | null;
  options: SelectedOptionSnapshot[];
  quantity: number;
  unitPrice: number; // agorot
  lineTotal: number; // agorot
};

export type StoreTotals = {
  lines: PricedLine[];
  total: number; // agorot
  currency: string;
};
