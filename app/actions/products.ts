"use server";

import { createAdminSupabaseClient } from "@/lib/supabase/admin";
import { isCurrentUserAdmin } from "@/lib/auth/admin-access";
import { parseProductInput } from "@/lib/store/product-schema";
import type { ProductInput } from "@/lib/store/product-schema";
import {
  PRODUCT_COLUMNS,
  rowToProduct,
  type ProductRow,
} from "@/lib/store/product-row";
import type { Product } from "@/lib/store/types";
import { presignUpload, productImagePublicUrl } from "@/lib/storage/s3";

const IMAGE_MIME = ["image/webp", "image/jpeg", "image/png"] as const;

/** DB columns for a product write, derived from validated input. */
function toRow(p: ProductInput) {
  return {
    slug: p.slug,
    status: p.status,
    title_he: p.titleHe,
    title_en: p.titleEn,
    description_he: p.descriptionHe,
    description_en: p.descriptionEn,
    price: p.price,
    currency: p.currency,
    image_url: p.imageUrl ?? null,
    images: p.images,
    options: p.options,
    sort_index: p.sortIndex,
  };
}

export async function listProductsAdmin(): Promise<Product[]> {
  if (!(await isCurrentUserAdmin())) return [];
  const admin = createAdminSupabaseClient();
  const { data, error } = await admin
    .from("products")
    .select(PRODUCT_COLUMNS)
    .order("sort_index", { ascending: true })
    .order("created_at", { ascending: false });
  if (error || !data) return [];
  return (data as unknown as ProductRow[]).map(rowToProduct);
}

export async function getProductAdmin(id: string): Promise<Product | null> {
  if (!(await isCurrentUserAdmin())) return null;
  const admin = createAdminSupabaseClient();
  const { data, error } = await admin
    .from("products")
    .select(PRODUCT_COLUMNS)
    .eq("id", id)
    .maybeSingle();
  if (error || !data) return null;
  return rowToProduct(data as unknown as ProductRow);
}

export type ProductMutationResult =
  | { ok: true; id: string }
  | { ok: false; errors?: Record<string, string>; message?: string };

export async function createProduct(input: unknown): Promise<ProductMutationResult> {
  if (!(await isCurrentUserAdmin())) return { ok: false, message: "forbidden" };
  const parsed = parseProductInput(input);
  if (!parsed.success) return { ok: false, errors: parsed.errors };

  const admin = createAdminSupabaseClient();
  const { data, error } = await admin
    .from("products")
    .insert(toRow(parsed.data))
    .select("id")
    .single();
  if (error || !data) {
    if ((error as { code?: string } | null)?.code === "23505") {
      return { ok: false, errors: { slug: "slug_taken" } };
    }
    return { ok: false, message: "db_error" };
  }
  return { ok: true, id: data.id };
}

export async function updateProduct(
  id: string,
  input: unknown,
): Promise<ProductMutationResult> {
  if (!(await isCurrentUserAdmin())) return { ok: false, message: "forbidden" };
  const parsed = parseProductInput(input);
  if (!parsed.success) return { ok: false, errors: parsed.errors };

  const admin = createAdminSupabaseClient();
  const { error } = await admin.from("products").update(toRow(parsed.data)).eq("id", id);
  if (error) {
    if ((error as { code?: string }).code === "23505") {
      return { ok: false, errors: { slug: "slug_taken" } };
    }
    return { ok: false, message: "db_error" };
  }
  return { ok: true, id };
}

/** Soft delete: archive so past orders keep their snapshots and it leaves the storefront. */
export async function deleteProduct(
  id: string,
): Promise<{ ok: boolean; message?: string }> {
  if (!(await isCurrentUserAdmin())) return { ok: false, message: "forbidden" };
  const admin = createAdminSupabaseClient();
  const { error } = await admin
    .from("products")
    .update({ status: "archived" })
    .eq("id", id);
  if (error) return { ok: false, message: "db_error" };
  return { ok: true };
}

/**
 * Mint a presigned S3 PUT URL for a product image. The browser PUTs the bytes
 * directly to the public-read products bucket (same IAM user as the sticker
 * buckets) — bytes never pass through the action, mirroring the sticker
 * presigned-PUT invariant. The storefront then reads the returned publicUrl.
 */
export async function createProductImageUpload(
  contentType: string,
): Promise<
  | { ok: true; uploadUrl: string; publicUrl: string }
  | { ok: false; message: string }
> {
  if (!(await isCurrentUserAdmin())) return { ok: false, message: "forbidden" };
  if (!IMAGE_MIME.includes(contentType as (typeof IMAGE_MIME)[number])) {
    return { ok: false, message: "invalid_type" };
  }
  const ext =
    contentType === "image/webp" ? "webp" : contentType === "image/png" ? "png" : "jpg";
  const key = `products/${crypto.randomUUID()}.${ext}`;

  try {
    const uploadUrl = await presignUpload(key, { contentType, bucket: "products" });
    return { ok: true, uploadUrl, publicUrl: productImagePublicUrl(key) };
  } catch {
    return { ok: false, message: "upload_init_failed" };
  }
}
