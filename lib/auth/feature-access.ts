import "server-only";

import { createAdminSupabaseClient } from "@/lib/supabase/admin";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { isAdmin } from "@/lib/auth/admin-access";

/**
 * Feature-access core: which gated features exist, their fallback default
 * visibility, and the pure access rule. The IO wrappers (DB reads + admin
 * bypass) are added below in Task 3 — this top section stays pure & testable.
 */

export const FEATURES = [
  { key: "stickers", defaultVisibility: "restricted" },
  { key: "store", defaultVisibility: "public" },
] as const;

export type FeatureKey = (typeof FEATURES)[number]["key"];
export type FeatureVisibility = "public" | "restricted";

/** Narrowing guard for untrusted input (server actions, route params). */
export function isFeatureKey(value: string): value is FeatureKey {
  return FEATURES.some((f) => f.key === value);
}

/** The code-side fallback visibility when no `feature_access` row exists yet. */
export function featureDefaultVisibility(feature: FeatureKey): FeatureVisibility {
  const found = FEATURES.find((f) => f.key === feature);
  return (found?.defaultVisibility ?? "restricted") as FeatureVisibility;
}

/**
 * Pure access rule. Admins bypass everything; public ⇒ everyone; restricted ⇒
 * the user must be signed in AND on the allow-list.
 */
export function evaluateFeatureAccess(input: {
  isAdmin: boolean;
  visibility: FeatureVisibility;
  userId: string | null;
  allowedUserIds: ReadonlySet<string>;
}): boolean {
  if (input.isAdmin) return true;
  if (input.visibility === "public") return true;
  if (!input.userId) return false;
  return input.allowedUserIds.has(input.userId);
}

/** Read a feature's visibility from the DB, falling back to the registry default. */
export async function getFeatureVisibility(
  feature: FeatureKey,
): Promise<FeatureVisibility> {
  const admin = createAdminSupabaseClient();
  const { data } = await admin
    .from("feature_access")
    .select("visibility")
    .eq("feature", feature)
    .maybeSingle();
  const visibility = (data as { visibility?: string } | null)?.visibility;
  return visibility === "public" || visibility === "restricted"
    ? visibility
    : featureDefaultVisibility(feature);
}

/**
 * Is this user allowed to use the feature? Admins bypass; public ⇒ yes;
 * restricted ⇒ the user must be signed in and on the allow-list. Skips the
 * allow-list query when the user is an admin or the feature is public.
 */
export async function isFeatureAllowed(
  feature: FeatureKey,
  user: { id: string; email?: string | null } | null,
): Promise<boolean> {
  if (await isAdmin(user)) return true;

  const visibility = await getFeatureVisibility(feature);
  if (visibility === "public") return true;
  if (!user) return false;

  const admin = createAdminSupabaseClient();
  const { data } = await admin
    .from("feature_allowlist")
    .select("user_id")
    .eq("feature", feature)
    .eq("user_id", user.id)
    .maybeSingle();

  return evaluateFeatureAccess({
    isAdmin: false,
    visibility,
    userId: user.id,
    allowedUserIds: new Set(data ? [user.id] : []),
  });
}

/**
 * Fetch the current session and evaluate access in one call. Mirrors the old
 * checkStickerAccess() shape — used by the gated server actions.
 */
export async function getCurrentUserFeatureAccess(feature: FeatureKey): Promise<{
  allowed: boolean;
  user: { id: string; email?: string | null } | null;
}> {
  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const slim = user ? { id: user.id, email: user.email } : null;
  return { allowed: await isFeatureAllowed(feature, slim), user: slim };
}
