"use server";

import { createAdminSupabaseClient } from "@/lib/supabase/admin";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { isCurrentUserAdmin } from "@/lib/auth/admin-access";
import { findUserByEmail } from "@/lib/auth/find-user";
import {
  FEATURES,
  isFeatureKey,
  getFeatureVisibility,
  type FeatureKey,
  type FeatureVisibility,
} from "@/lib/auth/feature-access";

export type AllowedUser = {
  userId: string;
  email: string;
  createdAtISO: string;
};

export type FeatureAccessView = {
  feature: FeatureKey;
  visibility: FeatureVisibility;
  allowed: AllowedUser[];
};

type MutationResult = { ok: boolean; message?: string };

/** Every feature with its current visibility + allow-list. Admin-gated. */
export async function listFeatureAccess(): Promise<FeatureAccessView[]> {
  if (!(await isCurrentUserAdmin())) return [];
  const admin = createAdminSupabaseClient();

  const { data: rows } = await admin
    .from("feature_allowlist")
    .select("feature, user_id, email, created_at")
    .order("created_at", { ascending: true });

  const allowByFeature = new Map<string, AllowedUser[]>();
  for (const r of (rows ?? []) as {
    feature: string;
    user_id: string;
    email: string;
    created_at: string;
  }[]) {
    const list = allowByFeature.get(r.feature) ?? [];
    list.push({ userId: r.user_id, email: r.email, createdAtISO: r.created_at });
    allowByFeature.set(r.feature, list);
  }

  const views: FeatureAccessView[] = [];
  for (const f of FEATURES) {
    views.push({
      feature: f.key,
      visibility: await getFeatureVisibility(f.key),
      allowed: allowByFeature.get(f.key) ?? [],
    });
  }
  return views;
}

export async function setFeatureVisibility(
  feature: string,
  visibility: string,
): Promise<MutationResult> {
  if (!(await isCurrentUserAdmin())) return { ok: false, message: "forbidden" };
  if (!isFeatureKey(feature)) return { ok: false, message: "invalid_feature" };
  if (visibility !== "public" && visibility !== "restricted") {
    return { ok: false, message: "invalid_visibility" };
  }

  const admin = createAdminSupabaseClient();
  const { error } = await admin
    .from("feature_access")
    .upsert({ feature, visibility }, { onConflict: "feature" });
  if (error) return { ok: false, message: "db_error" };
  return { ok: true };
}

export async function addFeatureAllowedUser(
  feature: string,
  email: string,
): Promise<MutationResult> {
  if (!(await isCurrentUserAdmin())) return { ok: false, message: "forbidden" };
  if (!isFeatureKey(feature)) return { ok: false, message: "invalid_feature" };

  const normalized = email.trim().toLowerCase();
  if (!normalized || !normalized.includes("@")) {
    return { ok: false, message: "invalid_email" };
  }

  const admin = createAdminSupabaseClient();
  const target = await findUserByEmail(admin, normalized);
  if (!target) return { ok: false, message: "user_not_found" };

  const supabase = await createServerSupabaseClient();
  const {
    data: { user: grantor },
  } = await supabase.auth.getUser();

  const { error } = await admin.from("feature_allowlist").upsert(
    {
      feature,
      user_id: target.id,
      email: target.email ?? normalized,
      granted_by: grantor?.id ?? null,
    },
    { onConflict: "feature,user_id" },
  );
  if (error) return { ok: false, message: "db_error" };
  return { ok: true };
}

export async function removeFeatureAllowedUser(
  feature: string,
  userId: string,
): Promise<MutationResult> {
  if (!(await isCurrentUserAdmin())) return { ok: false, message: "forbidden" };
  if (!isFeatureKey(feature)) return { ok: false, message: "invalid_feature" };

  const admin = createAdminSupabaseClient();
  const { error } = await admin
    .from("feature_allowlist")
    .delete()
    .eq("feature", feature)
    .eq("user_id", userId);
  if (error) return { ok: false, message: "db_error" };
  return { ok: true };
}
