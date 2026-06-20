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
  // `next` must be a same-origin absolute PATH ("/he/...") — reject anything
  // that could become an open redirect (full URLs, protocol-relative "//evil").
  const nextParam = searchParams.get("next");
  const safeNext =
    nextParam && nextParam.startsWith("/") && !nextParam.startsWith("//")
      ? nextParam
      : null;

  // Determine the fallback locale for redirect URLs
  const locale = isLocale(lang) ? lang : "he";

  const fallbackUrl = `${origin}/${locale}/login`;
  const successUrl = safeNext
    ? `${origin}${safeNext}`
    : `${origin}/${locale}/account/orders`;

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
