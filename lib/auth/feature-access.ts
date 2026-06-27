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
