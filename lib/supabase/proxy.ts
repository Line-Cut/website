import { createServerClient } from "@supabase/ssr";
import type { NextRequest, NextResponse } from "next/server";

/**
 * Refreshes the Supabase auth session cookie on every already-localized
 * request. This is the canonical SSR pattern: build a server client whose
 * setAll writes to BOTH the request cookies (so downstream Server Components
 * read the refreshed token) AND the provided response (so Set-Cookie headers
 * ride out to the browser). Then call getUser() to trigger a refresh if the
 * access token is expired, and return the same response object unchanged.
 *
 * CONTRACT: never create a new NextResponse between createServerClient and
 * return — that would drop the Set-Cookie headers written by setAll.
 */
export async function updateSession(
  request: NextRequest,
  response: NextResponse,
): Promise<NextResponse> {
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          // Write refreshed tokens to request so Server Components see them.
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value),
          );
          // Write Set-Cookie headers to the outgoing response.
          cookiesToSet.forEach(({ name, value, options }) =>
            response.cookies.set(name, value, options),
          );
        },
      },
    },
  );

  // Calling getUser() triggers a token refresh when the access token is
  // expired. We discard the result — this is cookie-refresh only (guest-
  // first; no route gating here).
  await supabase.auth.getUser();

  return response;
}
