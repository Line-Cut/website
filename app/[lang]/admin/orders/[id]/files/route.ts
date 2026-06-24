import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { createAdminSupabaseClient } from "@/lib/supabase/admin";
import { presignDownload } from "@/lib/storage/s3";
import { isOwnerEmail } from "@/lib/auth/is-owner";
import { isLocale } from "@/lib/i18n";

export const dynamic = "force-dynamic";

type StickerRow = {
  id: string;
  storage_key: string;
  original_filename: string;
};

export async function GET(
  request: NextRequest,
  ctx: { params: Promise<{ lang: string; id: string }> },
) {
  const { lang, id: orderId } = await ctx.params;
  const locale = isLocale(lang) ? lang : "he";

  // 1. Authenticate the request and enforce owner-only access
  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!isOwnerEmail(user?.email)) {
    // Not an owner — redirect to login
    const { origin } = request.nextUrl;
    return NextResponse.redirect(`${origin}/${locale}/login`);
  }

  // 2. Load the order's stickers via the admin client (bypasses RLS)
  const admin = createAdminSupabaseClient();

  // Paid orders are served from the paid bucket (where the order folder was
  // copied); everything else from the orders bucket. The friendly storage_key
  // is identical in both buckets.
  const { data: order } = await admin
    .from("orders")
    .select("paid_at")
    .eq("id", orderId)
    .maybeSingle();
  const bucket = order?.paid_at ? ("paid" as const) : ("orders" as const);

  const { data: stickers, error } = await admin
    .from("order_stickers")
    .select("id, storage_key, original_filename")
    .eq("order_id", orderId)
    .order("sort_index", { ascending: true });

  if (error || !stickers || stickers.length === 0) {
    return new NextResponse(
      JSON.stringify({ error: "Order not found or has no stickers." }),
      { status: 404, headers: { "Content-Type": "application/json" } },
    );
  }

  // 3. Generate presigned download URLs for each sticker
  const files = await Promise.all(
    (stickers as StickerRow[]).map(async (sticker) => {
      const url = await presignDownload(sticker.storage_key, { bucket });
      return {
        filename: sticker.original_filename,
        url,
      };
    }),
  );

  return NextResponse.json({ orderId, files });
}
