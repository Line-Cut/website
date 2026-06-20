/**
 * Tests for the root proxy.ts composition:
 *   1. Unlocalized path  → redirect (no Supabase work)
 *   2. Already-localized → pass-through with auth cookie refresh
 *
 * Strategy:
 *   - Mock @supabase/ssr so createServerClient returns a minimal stub with
 *     auth.getUser tracked by a spy.
 *   - Construct real NextRequest objects (importable from next/server in
 *     vitest / Node runtime).
 *   - Import proxy dynamically AFTER setting up mocks (vi.doMock is not
 *     hoisted, so resetModules + doMock + dynamic import is the right order).
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

// ── shared spy ────────────────────────────────────────────────────────────────
const getUserSpy = vi.fn().mockResolvedValue({ data: { user: null }, error: null });

// ── mock @supabase/ssr ────────────────────────────────────────────────────────
vi.mock("@supabase/ssr", () => ({
  createServerClient: vi.fn(() => ({
    auth: { getUser: getUserSpy },
  })),
}));

// ── helpers ───────────────────────────────────────────────────────────────────
function makeRequest(url: string, acceptLanguage?: string) {
  const headers: HeadersInit = acceptLanguage
    ? { "accept-language": acceptLanguage }
    : {};
  return new NextRequest(url, { headers });
}

// ── tests ─────────────────────────────────────────────────────────────────────
describe("proxy (root)", () => {
  beforeEach(() => {
    getUserSpy.mockClear();
    // Provide env vars that lib/supabase/proxy.ts reads
    process.env.NEXT_PUBLIC_SUPABASE_URL = "https://test.supabase.co";
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = "test-anon-key";
  });

  it("redirects an unlocalized path to /{locale}{path} without calling getUser", async () => {
    const { proxy } = await import("./proxy");
    const request = makeRequest("http://localhost/", "en-US,en;q=0.9");
    const response = await proxy(request);

    // Must be a redirect
    expect(response?.status).toBeGreaterThanOrEqual(300);
    expect(response?.status).toBeLessThan(400);

    // Destination must include a recognized locale prefix (full URL in header)
    const location = response?.headers.get("location") ?? "";
    expect(location).toMatch(/\/(he|en)(\/|$)/);

    // No Supabase work for the redirect branch
    expect(getUserSpy).not.toHaveBeenCalled();
  });

  it("redirects an unlocalized path to /he when accept-language is Hebrew", async () => {
    const { proxy } = await import("./proxy");
    const request = makeRequest("http://localhost/stickers", "he-IL,he;q=0.9");
    const response = await proxy(request);

    const location = response?.headers.get("location") ?? "";
    expect(location).toMatch(/\/he(\/|$)/);
    expect(getUserSpy).not.toHaveBeenCalled();
  });

  it("does NOT redirect an already-localized path and calls getUser for cookie refresh", async () => {
    const { proxy } = await import("./proxy");
    const request = makeRequest("http://localhost/he/stickers");
    const response = await proxy(request);

    // Not a redirect (2xx pass-through)
    expect(response?.status).toBeLessThan(300);

    // Supabase session refresh MUST have run
    expect(getUserSpy).toHaveBeenCalledOnce();
  });

  it("does NOT redirect /en/ and calls getUser", async () => {
    const { proxy } = await import("./proxy");
    const request = makeRequest("http://localhost/en/account/orders");
    const response = await proxy(request);

    expect(response?.status).toBeLessThan(300);
    expect(getUserSpy).toHaveBeenCalledOnce();
  });

  it("handles /he (root locale) without redirect and refreshes session", async () => {
    const { proxy } = await import("./proxy");
    const request = makeRequest("http://localhost/he");
    const response = await proxy(request);

    expect(response?.status).toBeLessThan(300);
    expect(getUserSpy).toHaveBeenCalledOnce();
  });
});
