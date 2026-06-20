"use server";

import { createAdminSupabaseClient } from "@/lib/supabase/admin";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { presignUpload } from "@/lib/storage/s3";
import { createDraft } from "@/lib/orders/create-draft";
import type { CreateDraftResult } from "@/lib/orders/create-draft";

export async function createOrderDraft(
  input: unknown,
): Promise<CreateDraftResult> {
  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  return createDraft(input, {
    admin: createAdminSupabaseClient(),
    presignUpload,
    userId: user?.id ?? null,
  });
}
