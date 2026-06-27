import "server-only";

import { createServerSupabaseClient } from "@/lib/supabase/server";
import { createAdminSupabaseClient } from "@/lib/supabase/admin";
import { isOwnerEmail } from "@/lib/auth/is-owner";

/**
 * Admin = either an OWNER_NOTIFY_EMAIL bootstrap account (env, can never be
 * locked out) OR a row in the `admins` table (DB-managed, granted from the UI).
 * All admin gates funnel through here so the two sources stay in lock-step.
 */

async function isUserIdAdmin(userId: string): Promise<boolean> {
  const admin = createAdminSupabaseClient();
  const { data } = await admin
    .from("admins")
    .select("user_id")
    .eq("user_id", userId)
    .maybeSingle();
  return Boolean(data);
}

/** Is the given user an admin? (Use when you already have the user object.) */
export async function isAdmin(
  user: { id: string; email?: string | null } | null,
): Promise<boolean> {
  if (!user) return false;
  if (isOwnerEmail(user.email)) return true;
  return isUserIdAdmin(user.id);
}

/** Is the CURRENT signed-in user an admin? Fetches the session itself. */
export async function isCurrentUserAdmin(): Promise<boolean> {
  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return isAdmin(user ? { id: user.id, email: user.email } : null);
}
