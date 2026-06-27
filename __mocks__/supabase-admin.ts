// Vitest stub for lib/supabase/admin — the real module throws in browser contexts.
export function createAdminSupabaseClient() {
  return {} as ReturnType<typeof import("@supabase/supabase-js").createClient>;
}
