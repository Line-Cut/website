"use server";

import type { SupabaseClient } from "@supabase/supabase-js";
import { createAdminSupabaseClient } from "@/lib/supabase/admin";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { isCurrentUserAdmin } from "@/lib/auth/admin-access";

export type AdminUser = {
  userId: string;
  email: string;
  createdAtISO: string;
};

type MutationResult = { ok: boolean; message?: string };

/** Find an auth user by email (case-insensitive). Paginates the admin API. */
async function findUserByEmail(
  admin: SupabaseClient,
  email: string,
): Promise<{ id: string; email?: string } | null> {
  const perPage = 200;
  for (let page = 1; page <= 50; page++) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage });
    if (error || !data) return null;
    const match = data.users.find((u) => u.email?.toLowerCase() === email);
    if (match) return { id: match.id, email: match.email ?? undefined };
    if (data.users.length < perPage) return null; // last page
  }
  return null;
}

/** DB-managed admins (the env OWNER_NOTIFY_EMAIL owners are not listed here). */
export async function listAdmins(): Promise<AdminUser[]> {
  if (!(await isCurrentUserAdmin())) return [];
  const admin = createAdminSupabaseClient();
  const { data, error } = await admin
    .from("admins")
    .select("user_id, email, created_at")
    .order("created_at", { ascending: true });
  if (error || !data) return [];
  return (data as { user_id: string; email: string; created_at: string }[]).map(
    (r) => ({ userId: r.user_id, email: r.email, createdAtISO: r.created_at }),
  );
}

export async function grantAdmin(email: string): Promise<MutationResult> {
  if (!(await isCurrentUserAdmin())) return { ok: false, message: "forbidden" };
  const normalized = email.trim().toLowerCase();
  if (!normalized || !normalized.includes("@")) {
    return { ok: false, message: "invalid_email" };
  }

  const admin = createAdminSupabaseClient();
  const target = await findUserByEmail(admin, normalized);
  if (!target) return { ok: false, message: "user_not_found" };

  // Record who granted (audit).
  const supabase = await createServerSupabaseClient();
  const {
    data: { user: grantor },
  } = await supabase.auth.getUser();

  const { error } = await admin.from("admins").upsert(
    {
      user_id: target.id,
      email: target.email ?? normalized,
      granted_by: grantor?.id ?? null,
    },
    { onConflict: "user_id" },
  );
  if (error) return { ok: false, message: "db_error" };
  return { ok: true };
}

export async function revokeAdmin(userId: string): Promise<MutationResult> {
  if (!(await isCurrentUserAdmin())) return { ok: false, message: "forbidden" };
  const admin = createAdminSupabaseClient();
  const { error } = await admin.from("admins").delete().eq("user_id", userId);
  if (error) return { ok: false, message: "db_error" };
  return { ok: true };
}
