import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Find an auth user by email (case-insensitive). Paginates the admin API.
 * Returns null if not found. Requires a service-role (admin) client.
 */
export async function findUserByEmail(
  admin: SupabaseClient,
  email: string,
): Promise<{ id: string; email?: string } | null> {
  const normalized = email.trim().toLowerCase();
  const perPage = 200;
  for (let page = 1; page <= 50; page++) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage });
    if (error || !data) return null;
    const match = data.users.find((u) => u.email?.toLowerCase() === normalized);
    if (match) return { id: match.id, email: match.email ?? undefined };
    if (data.users.length < perPage) return null; // last page
  }
  return null;
}
