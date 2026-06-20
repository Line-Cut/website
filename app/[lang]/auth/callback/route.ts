import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { isLocale } from "@/lib/i18n";

export const dynamic = "force-dynamic";

export async function GET(
  request: NextRequest,
  ctx: { params: Promise<{ lang: string }> },
) {
  const { lang } = await ctx.params;
  const { searchParams, origin } = request.nextUrl;

  const code = searchParams.get("code");
  const next = searchParams.get("next");

  // Determine the fallback locale for redirect URLs
  const locale = isLocale(lang) ? lang : "he";

  const fallbackUrl = `${origin}/${locale}/login`;
  const successUrl = next ?? `${origin}/${locale}/account/orders`;

  // If no code provided, redirect to login
  if (!code) {
    return NextResponse.redirect(fallbackUrl);
  }

  try {
    const supabase = await createServerSupabaseClient();
    const { error } = await supabase.auth.exchangeCodeForSession(code);

    if (error) {
      return NextResponse.redirect(fallbackUrl);
    }

    return NextResponse.redirect(successUrl);
  } catch {
    return NextResponse.redirect(fallbackUrl);
  }
}
