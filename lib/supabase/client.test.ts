import { describe, it, expect, vi, beforeEach } from "vitest";

const mockCreateBrowserClient = vi.fn(() => ({ mock: true }));

vi.mock("@supabase/ssr", () => ({
  createBrowserClient: mockCreateBrowserClient,
}));

describe("createBrowserSupabaseClient", () => {
  beforeEach(() => {
    vi.resetModules();
    mockCreateBrowserClient.mockClear();
    process.env.NEXT_PUBLIC_SUPABASE_URL = "https://test.supabase.co";
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = "test-anon-key";
  });

  it("calls createBrowserClient with the correct URL and anon key", async () => {
    const { createBrowserSupabaseClient } = await import("./client");
    const client = createBrowserSupabaseClient();

    expect(client).toEqual({ mock: true });
    expect(mockCreateBrowserClient).toHaveBeenCalledOnce();
    expect(mockCreateBrowserClient).toHaveBeenCalledWith(
      "https://test.supabase.co",
      "test-anon-key"
    );
  });
});
