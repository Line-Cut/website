// Vitest stub for lib/supabase/server — not needed in pure unit tests.
export async function createServerSupabaseClient() {
  return {} as Awaited<ReturnType<typeof import("../lib/supabase/server").createServerSupabaseClient>>;
}
