import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { locales, getLocale } from "@/lib/i18n";

export function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const hasLocale = locales.some(
    (l) => pathname === `/${l}` || pathname.startsWith(`/${l}/`),
  );
  if (hasLocale) return;

  const locale = getLocale(request.headers.get("accept-language"));
  request.nextUrl.pathname = `/${locale}${pathname}`;
  return NextResponse.redirect(request.nextUrl);
}

export const config = {
  // Skip _next internals, api, and any path with a file extension (favicon, svg…)
  matcher: ["/((?!_next|api|.*\\..*).*)"],
};
