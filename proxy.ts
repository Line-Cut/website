import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { locales, getLocale } from "@/lib/i18n";
import { updateSession } from "@/lib/supabase/proxy";

export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const hasLocale = locales.some(
    (l) => pathname === `/${l}` || pathname.startsWith(`/${l}/`),
  );

  // 1. Locale redirect — cheap, returns before any Supabase work.
  //    The browser will re-request the localized URL; that request will
  //    pass through the else branch below and refresh cookies then.
  if (!hasLocale) {
    const locale = getLocale(request.headers.get("accept-language"));
    request.nextUrl.pathname = `/${locale}${pathname}`;
    return NextResponse.redirect(request.nextUrl);
  }

  // 2. Already-localized path — refresh auth cookies and pass through.
  const response = NextResponse.next({ request });
  return updateSession(request, response);
}

export const config = {
  // Skip _next internals, api, and any path with a file extension (favicon, svg…)
  matcher: ["/((?!_next|api|.*\\..*).*)"],
};
