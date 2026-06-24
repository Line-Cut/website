# Saved, Editable Sticker-Order Drafts — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let signed-in users save an in-progress sticker order, edit it (add/remove stickers, change quantity), and finalize it later from their account.

**Architecture:** Make the existing draft `orders` row (`confirmed_at IS NULL` + `user_id`) first-class — add update/list/get/discard IO-cores in `lib/orders/` (DI, mirroring `create-draft`/`confirm-order`), thin `"use server"` wrappers in `app/actions/stickers.ts`, and let the builder load a draft via `?draft=<id>`. No DB migration; reuses the schema, RLS, the `lib/storage/keys.ts` scheme, and `computePrice`.

**Tech Stack:** Next.js 16 App Router + React 19, TypeScript, Supabase (admin/service-role client), AWS S3 (presigned URLs), Zod, Vitest + Testing Library.

## Global Constraints

- **Signed-in users only.** Guests keep today's ephemeral build→checkout→confirm flow unchanged.
- **Edit only while a draft** (`confirmed_at IS NULL`). A confirmed order is locked.
- **All draft writes go through the admin (service-role) client**, filtered by `user_id` (RLS invariant). Never add an anon/owner write policy.
- **Money is in agorot** (integers); price is **snapshotted** onto the `orders` row on every save via `computePrice`. Never recompute on read.
- **Draft files stay under the temp key** `u_<userId>/<orderId>/<stickerId>.webp` (`lib/storage/keys.ts`). The friendly-folder re-key + `metadata.pdf` + paid-bucket copy happen **only at confirm** — do not touch that.
- **Uploads go browser→S3 direct** via presigned PUT (reuse `uploadFiles` from `lib/stickers/upload-client.ts`); never POST file bytes through an action.
- **Edit both `he.json` and `en.json`** for any new copy (the dictionary parity test fails otherwise).
- Commands: tests `npx vitest run <path>`; typecheck `npm run typecheck`; build `npm run build`.

---

### Task 1: `deleteObjects` batch helper in S3 layer

**Files:**
- Modify: `lib/storage/s3.ts`
- Test: `lib/storage/s3.test.ts`

**Interfaces:**
- Consumes: existing `S3Bucket` type, `resolveBucket`, `getClient`, `DeleteObjectsCommand` (already imported).
- Produces: `deleteObjects(keys: string[], opts?: { bucket?: S3Bucket }): Promise<void>` — batch-deletes specific keys; no-op on empty array.

- [ ] **Step 1: Write the failing test** — append to `lib/storage/s3.test.ts` (the file already mocks `@aws-sdk/client-s3` incl. `DeleteObjectsCommand`, and exposes `mockSend`). Add `deleteObjects` to the import from `./s3`, then add:

```ts
describe("deleteObjects", () => {
  test("deletes the given keys in one batch in the orders bucket", async () => {
    mockSend.mockResolvedValueOnce({ Deleted: [] });
    await deleteObjects(["a/1.webp", "a/2.webp"]);

    expect(mockSend).toHaveBeenCalledTimes(1);
    const cmd = mockSend.mock.calls[0][0];
    expect(cmd).toBeInstanceOf(DeleteObjectsCommand);
    expect((cmd as InstanceType<typeof DeleteObjectsCommand>).input).toMatchObject({
      Bucket: "test-stickers-bucket",
      Delete: { Objects: [{ Key: "a/1.webp" }, { Key: "a/2.webp" }] },
    });
  });

  test("is a no-op when given no keys", async () => {
    await deleteObjects([]);
    expect(mockSend).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run lib/storage/s3.test.ts -t deleteObjects`
Expected: FAIL — `deleteObjects is not a function` / import undefined.

- [ ] **Step 3: Implement** — add to `lib/storage/s3.ts` (after `copyPrefix`, before `deletePrefix`):

```ts
/** Delete a specific set of object keys in one batch. No-op on empty input. */
export async function deleteObjects(
  keys: string[],
  opts?: { bucket?: S3Bucket }
): Promise<void> {
  if (keys.length === 0) return;
  const Bucket = resolveBucket(opts?.bucket);
  await getClient().send(
    new DeleteObjectsCommand({
      Bucket,
      Delete: { Objects: keys.map((Key) => ({ Key })) },
    })
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run lib/storage/s3.test.ts`
Expected: PASS (all s3 tests).

- [ ] **Step 5: Commit**

```bash
git add lib/storage/s3.ts lib/storage/s3.test.ts
git commit -m "feat(s3): add deleteObjects batch helper"
```

---

### Task 2: `updateDraftSchema` validation

**Files:**
- Modify: `lib/orders/draft-schema.ts`
- Test: `lib/orders/draft-schema.test.ts`

**Interfaces:**
- Consumes: existing `stickerMetaSchema`, `stickerConfig` (already in `draft-schema.ts`).
- Produces: `parseUpdateDraft(data: unknown): { success: true; data: UpdateDraftInput } | { success: false; errors: Record<string,string> }` where `UpdateDraftInput = { orderId: string; keepStickerIds: string[]; addStickers: StickerMeta[]; copies: number }`.

- [ ] **Step 1: Write the failing test** — append to `lib/orders/draft-schema.test.ts` (create the file if absent, mirroring `parseDraft` tests). Add:

```ts
import { parseUpdateDraft } from "@/lib/orders/draft-schema";

const meta = { filename: "a.webp", bytes: 1024, contentType: "image/webp", width: 64, height: 64 };

describe("parseUpdateDraft", () => {
  it("accepts keep-only", () => {
    const r = parseUpdateDraft({ orderId: "o1", keepStickerIds: ["s1"], addStickers: [], copies: 1 });
    expect(r.success).toBe(true);
  });
  it("accepts add-only", () => {
    const r = parseUpdateDraft({ orderId: "o1", keepStickerIds: [], addStickers: [meta], copies: 2 });
    expect(r.success).toBe(true);
  });
  it("rejects an empty final set (no keep, no add)", () => {
    const r = parseUpdateDraft({ orderId: "o1", keepStickerIds: [], addStickers: [], copies: 1 });
    expect(r.success).toBe(false);
  });
  it("rejects copies < 1", () => {
    const r = parseUpdateDraft({ orderId: "o1", keepStickerIds: ["s1"], addStickers: [], copies: 0 });
    expect(r.success).toBe(false);
  });
  it("rejects a non-webp added sticker", () => {
    const r = parseUpdateDraft({ orderId: "o1", keepStickerIds: [], addStickers: [{ ...meta, contentType: "image/png" }], copies: 1 });
    expect(r.success).toBe(false);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run lib/orders/draft-schema.test.ts -t parseUpdateDraft`
Expected: FAIL — `parseUpdateDraft` undefined.

- [ ] **Step 3: Implement** — append to `lib/orders/draft-schema.ts`:

```ts
export const updateDraftSchema = z
  .object({
    orderId: z.string().min(1, "required"),
    keepStickerIds: z.array(z.string()),
    addStickers: z
      .array(stickerMetaSchema)
      .max(stickerConfig.maxStickers, "too_many_stickers"),
    copies: z.number().int().min(1, "copies_min_1"),
  })
  .superRefine((data, ctx) => {
    const total = data.keepStickerIds.length + data.addStickers.length;
    if (total < 1) {
      ctx.addIssue({ code: "custom", path: ["addStickers"], message: "min_one_sticker" });
    }
    if (total > stickerConfig.maxStickers) {
      ctx.addIssue({ code: "custom", path: ["addStickers"], message: "too_many_stickers" });
    }
  });

export type UpdateDraftInput = z.infer<typeof updateDraftSchema>;

export function parseUpdateDraft(
  data: unknown,
):
  | { success: true; data: UpdateDraftInput }
  | { success: false; errors: Record<string, string> } {
  const result = updateDraftSchema.safeParse(data);
  if (result.success) return { success: true, data: result.data };
  const errors: Record<string, string> = {};
  for (const issue of result.error.issues) {
    const key = issue.path.length > 0 ? issue.path.map(String).join(".") : "form";
    if (!errors[key]) errors[key] = issue.message;
  }
  return { success: false, errors };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run lib/orders/draft-schema.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add lib/orders/draft-schema.ts lib/orders/draft-schema.test.ts
git commit -m "feat(orders): add updateDraft validation schema"
```

---

### Task 3: `updateDraft` core (add/remove diff + re-snapshot)

**Files:**
- Create: `lib/orders/update-draft.ts`
- Test: `lib/orders/update-draft.test.ts`

**Interfaces:**
- Consumes: `parseUpdateDraft` (Task 2); `computePrice` (`lib/stickers/pricing`); `stickerKey` (`lib/storage/keys`); `StickerMeta` (`lib/stickers/types`).
- Produces:
  - `UpdateDraftDeps = { admin: SupabaseClient; presignUpload: (key, opts?) => Promise<string>; deleteObjects: (keys: string[]) => Promise<void>; userId: string; newId?: () => string }`
  - `UpdateDraftResult = { ok: true; orderId: string; uploads: { stickerId: string; key: string; url: string }[] } | { ok: false; errors?: Record<string,string>; message?: string }`
  - `updateDraft(input: unknown, deps: UpdateDraftDeps): Promise<UpdateDraftResult>`

- [ ] **Step 1: Write the failing test** — create `lib/orders/update-draft.test.ts`. The fake admin must support: `orders` → `select().eq().eq().maybeSingle()` and `update().eq()`; `order_stickers` → `select().eq()`, `delete().in()`, `insert()`.

```ts
vi.mock("server-only", () => ({}));

import { describe, it, expect, vi } from "vitest";
import { updateDraft } from "@/lib/orders/update-draft";
import type { UpdateDraftDeps } from "@/lib/orders/update-draft";
import { computePrice } from "@/lib/stickers/pricing";

const META = { filename: "n.webp", bytes: 2048, contentType: "image/webp", width: 64, height: 64 };

function makeFakeAdmin({
  order = { id: "o1", confirmed_at: null } as { id: string; confirmed_at: string | null } | null,
  existing = [
    { id: "s1", storage_key: "u_user-1/o1/s1.webp", sort_index: 0 },
    { id: "s2", storage_key: "u_user-1/o1/s2.webp", sort_index: 1 },
  ],
} = {}) {
  const calls = { deletedIn: [] as string[][], inserted: [] as unknown[], updated: [] as unknown[] };
  const admin = {
    _calls: calls,
    from(table: string) {
      if (table === "orders") {
        return {
          select() { return this; },
          eq() { return this; },
          maybeSingle() { return Promise.resolve({ data: order, error: null }); },
          update(payload: unknown) {
            calls.updated.push(payload);
            return { eq() { return Promise.resolve({ error: null }); } };
          },
        };
      }
      if (table === "order_stickers") {
        return {
          select() { return { eq() { return Promise.resolve({ data: existing, error: null }); } }; },
          delete() { return { in(_c: string, ids: string[]) { calls.deletedIn.push(ids); return Promise.resolve({ error: null }); } }; },
          insert(rows: unknown) { calls.inserted.push(rows); return Promise.resolve({ error: null }); },
        };
      }
      throw new Error(`Unexpected table: ${table}`);
    },
  };
  return admin;
}

function makeDeps(over: Partial<UpdateDraftDeps> = {}): UpdateDraftDeps {
  let i = 0;
  return {
    admin: makeFakeAdmin() as unknown as UpdateDraftDeps["admin"],
    presignUpload: vi.fn(async (key: string) => `https://signed/${key}`),
    deleteObjects: vi.fn(async () => {}),
    userId: "user-1",
    newId: () => `new-${++i}`,
    ...over,
  };
}

describe("updateDraft", () => {
  it("removes dropped stickers (S3 + DB) and re-snapshots price", async () => {
    const admin = makeFakeAdmin();
    const deps = makeDeps({ admin: admin as unknown as UpdateDraftDeps["admin"] });
    // keep s1, drop s2, add one new → 2 stickers
    const result = await updateDraft(
      { orderId: "o1", keepStickerIds: ["s1"], addStickers: [META], copies: 3 },
      deps,
    );
    expect(result.ok).toBe(true);
    expect(deps.deleteObjects).toHaveBeenCalledWith(["u_user-1/o1/s2.webp"]);
    expect(admin._calls.deletedIn).toEqual([["s2"]]);
    const breakdown = computePrice(2, 3); // 1 kept + 1 added
    expect(admin._calls.updated[0]).toMatchObject({ copies: 3, price_total: breakdown.total });
    const r = result as { ok: true; uploads: { key: string }[] };
    expect(r.uploads).toHaveLength(1);
    expect(r.uploads[0].key).toBe("u_user-1/o1/new-1.webp");
  });

  it("appends new stickers after the current max sort_index", async () => {
    const admin = makeFakeAdmin();
    const deps = makeDeps({ admin: admin as unknown as UpdateDraftDeps["admin"] });
    await updateDraft({ orderId: "o1", keepStickerIds: ["s1", "s2"], addStickers: [META], copies: 1 }, deps);
    const rows = admin._calls.inserted[0] as { sort_index: number }[];
    expect(rows[0].sort_index).toBe(2);
  });

  it("does not delete when nothing was removed", async () => {
    const deps = makeDeps();
    await updateDraft({ orderId: "o1", keepStickerIds: ["s1", "s2"], addStickers: [META], copies: 1 }, deps);
    expect(deps.deleteObjects).not.toHaveBeenCalled();
  });

  it("returns not_found when the order is not the user's draft", async () => {
    const admin = makeFakeAdmin({ order: null });
    const deps = makeDeps({ admin: admin as unknown as UpdateDraftDeps["admin"] });
    const r = await updateDraft({ orderId: "o1", keepStickerIds: ["s1"], addStickers: [], copies: 1 }, deps);
    expect(r).toEqual({ ok: false, message: "not_found" });
  });

  it("returns already_finalized for a confirmed order", async () => {
    const admin = makeFakeAdmin({ order: { id: "o1", confirmed_at: "2026-01-01T00:00:00Z" } });
    const deps = makeDeps({ admin: admin as unknown as UpdateDraftDeps["admin"] });
    const r = await updateDraft({ orderId: "o1", keepStickerIds: ["s1"], addStickers: [], copies: 1 }, deps);
    expect(r).toEqual({ ok: false, message: "already_finalized" });
  });

  it("returns validation errors for an empty final set", async () => {
    const deps = makeDeps();
    const r = await updateDraft({ orderId: "o1", keepStickerIds: [], addStickers: [], copies: 1 }, deps);
    expect(r).toMatchObject({ ok: false });
    expect((r as { errors?: unknown }).errors).toBeDefined();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run lib/orders/update-draft.test.ts`
Expected: FAIL — module `update-draft` not found.

- [ ] **Step 3: Implement** — create `lib/orders/update-draft.ts`:

```ts
import "server-only";

import { parseUpdateDraft } from "@/lib/orders/draft-schema";
import { computePrice } from "@/lib/stickers/pricing";
import { stickerKey } from "@/lib/storage/keys";

export type UpdateDraftDeps = {
  admin: import("@supabase/supabase-js").SupabaseClient;
  presignUpload: (
    key: string,
    opts?: { contentType?: string; expiresIn?: number },
  ) => Promise<string>;
  deleteObjects: (keys: string[]) => Promise<void>;
  /** Signed-in user; ownership is enforced against this. */
  userId: string;
  newId?: () => string;
};

export type UpdateDraftResult =
  | {
      ok: true;
      orderId: string;
      uploads: { stickerId: string; key: string; url: string }[];
    }
  | { ok: false; errors?: Record<string, string>; message?: string };

export async function updateDraft(
  input: unknown,
  deps: UpdateDraftDeps,
): Promise<UpdateDraftResult> {
  const newId = deps.newId ?? (() => crypto.randomUUID());

  const parsed = parseUpdateDraft(input);
  if (!parsed.success) return { ok: false, errors: parsed.errors };
  const { orderId, keepStickerIds, addStickers, copies } = parsed.data;

  // 1. Load + guard: must be the signed-in user's own draft.
  const { data: order, error: orderError } = await deps.admin
    .from("orders")
    .select("id, confirmed_at")
    .eq("id", orderId)
    .eq("user_id", deps.userId)
    .maybeSingle();
  if (orderError || !order) return { ok: false, message: "not_found" };
  if (order.confirmed_at != null) return { ok: false, message: "already_finalized" };

  // 2. Load existing stickers and diff against keepStickerIds.
  const { data: existing, error: exErr } = await deps.admin
    .from("order_stickers")
    .select("id, storage_key, sort_index")
    .eq("order_id", orderId);
  if (exErr || !existing) return { ok: false, message: "db_error" };

  const keepSet = new Set(keepStickerIds);
  const removed = existing.filter((s) => !keepSet.has(s.id as string));
  const kept = existing.filter((s) => keepSet.has(s.id as string));

  const finalCount = kept.length + addStickers.length;
  if (finalCount < 1) return { ok: false, message: "no_stickers" };

  // 3. Remove dropped stickers (S3 objects + DB rows).
  if (removed.length > 0) {
    await deps.deleteObjects(removed.map((s) => s.storage_key as string));
    const { error: delErr } = await deps.admin
      .from("order_stickers")
      .delete()
      .in("id", removed.map((s) => s.id as string));
    if (delErr) return { ok: false, message: "db_error" };
  }

  // 4. Add new stickers (rows + presigned PUTs), appended after current max.
  const maxSort = kept.reduce(
    (m, s) => Math.max(m, (s.sort_index as number) ?? 0),
    -1,
  );
  const newRows = addStickers.map((meta, i) => {
    const stickerId = newId();
    const key = stickerKey({ userId: deps.userId, guestToken: "", orderId, stickerId });
    return {
      row: {
        id: stickerId,
        order_id: orderId,
        storage_key: key,
        original_filename: meta.filename,
        width: meta.width,
        height: meta.height,
        bytes: meta.bytes,
        content_type: meta.contentType,
        sort_index: maxSort + 1 + i,
      },
      stickerId,
      key,
    };
  });
  if (newRows.length > 0) {
    const { error: insErr } = await deps.admin
      .from("order_stickers")
      .insert(newRows.map((r) => r.row));
    if (insErr) return { ok: false, message: "db_error" };
  }

  // 5. Re-snapshot price onto the order.
  const breakdown = computePrice(finalCount, copies);
  const { error: updErr } = await deps.admin
    .from("orders")
    .update({
      copies,
      price_sheets: breakdown.totalSheets,
      price_rate: breakdown.perSheetRate,
      price_setup: breakdown.setupFee,
      price_currency: breakdown.currency,
      price_total: breakdown.total,
    })
    .eq("id", orderId);
  if (updErr) return { ok: false, message: "db_error" };

  // 6. Presign PUTs for the added stickers.
  const uploads = await Promise.all(
    newRows.map(async (r) => ({
      stickerId: r.stickerId,
      key: r.key,
      url: await deps.presignUpload(r.key, { contentType: "image/webp" }),
    })),
  );

  return { ok: true, orderId, uploads };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run lib/orders/update-draft.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add lib/orders/update-draft.ts lib/orders/update-draft.test.ts
git commit -m "feat(orders): updateDraft core (add/remove + re-snapshot price)"
```

---

### Task 4: Draft read cores — `getUserDrafts` + `getDraftForEdit`

**Files:**
- Create: `lib/orders/draft-view.ts`
- Test: `lib/orders/draft-view.test.ts`

**Interfaces:**
- Consumes: `PriceBreakdown` (`lib/stickers/types`).
- Produces:
  - `DraftViewDeps = { admin: SupabaseClient; userId: string; presignDownload: (key, opts?) => Promise<string> }`
  - `DraftListItem = { orderId: string; guestToken: string; stickerCount: number; copies: number; breakdown: PriceBreakdown; updatedAtISO: string; thumbnailUrl: string | null }`
  - `getUserDrafts(deps: DraftViewDeps): Promise<DraftListItem[]>`
  - `DraftEditSticker = { id: string; storageKey: string; filename: string; width: number|null; height: number|null; bytes: number; url: string }`
  - `DraftEditData = { orderId: string; copies: number; stickers: DraftEditSticker[] }`
  - `getDraftForEdit(orderId: string, deps: DraftViewDeps): Promise<DraftEditData | null>`

- [ ] **Step 1: Write the failing test** — create `lib/orders/draft-view.test.ts`:

```ts
vi.mock("server-only", () => ({}));

import { describe, it, expect, vi } from "vitest";
import { getUserDrafts, getDraftForEdit } from "@/lib/orders/draft-view";
import type { DraftViewDeps } from "@/lib/orders/draft-view";

const DRAFT_ROW = {
  id: "o1", guest_token: "gt1", copies: 2,
  price_sheets: 4, price_rate: 1000, price_setup: 500, price_total: 4500, price_currency: "ILS",
  updated_at: "2026-06-24T10:00:00.000Z",
  order_stickers: [
    { id: "s2", storage_key: "u_u1/o1/s2.webp", sort_index: 1 },
    { id: "s1", storage_key: "u_u1/o1/s1.webp", sort_index: 0 },
  ],
};

function presign() { return vi.fn(async (k: string) => `https://signed/${k}`); }

describe("getUserDrafts", () => {
  it("maps rows, counts stickers, and presigns the first sticker as thumbnail", async () => {
    const admin = {
      from: () => ({
        select: () => ({ eq: () => ({ is: () => ({ order: () => Promise.resolve({ data: [DRAFT_ROW], error: null }) }) }) }),
      }),
    };
    const presignDownload = presign();
    const result = await getUserDrafts({ admin: admin as unknown as DraftViewDeps["admin"], userId: "u1", presignDownload });
    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({ orderId: "o1", guestToken: "gt1", stickerCount: 2, copies: 2 });
    expect(result[0].breakdown.total).toBe(4500);
    // first by sort_index is s1
    expect(presignDownload).toHaveBeenCalledWith("u_u1/o1/s1.webp", { expiresIn: 3600 });
    expect(result[0].thumbnailUrl).toBe("https://signed/u_u1/o1/s1.webp");
  });
});

describe("getDraftForEdit", () => {
  it("returns null for a non-owned/confirmed order", async () => {
    const admin = { from: () => ({ select: () => ({ eq: () => ({ eq: () => ({ is: () => ({ maybeSingle: () => Promise.resolve({ data: null, error: null }) }) }) }) }) }) };
    const r = await getDraftForEdit("o1", { admin: admin as unknown as DraftViewDeps["admin"], userId: "u1", presignDownload: presign() });
    expect(r).toBeNull();
  });

  it("returns copies + stickers with presigned urls", async () => {
    const order = { id: "o1", copies: 3, confirmed_at: null };
    const stickers = [{ id: "s1", storage_key: "u_u1/o1/s1.webp", original_filename: "a.webp", width: 64, height: 64, bytes: 100, sort_index: 0 }];
    const admin = {
      from: (t: string) => t === "orders"
        ? { select: () => ({ eq: () => ({ eq: () => ({ is: () => ({ maybeSingle: () => Promise.resolve({ data: order, error: null }) }) }) }) }) }
        : { select: () => ({ eq: () => ({ order: () => Promise.resolve({ data: stickers, error: null }) }) }) },
    };
    const r = await getDraftForEdit("o1", { admin: admin as unknown as DraftViewDeps["admin"], userId: "u1", presignDownload: presign() });
    expect(r).toMatchObject({ orderId: "o1", copies: 3 });
    expect(r!.stickers[0]).toMatchObject({ id: "s1", storageKey: "u_u1/o1/s1.webp", url: "https://signed/u_u1/o1/s1.webp" });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run lib/orders/draft-view.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement** — create `lib/orders/draft-view.ts`:

```ts
import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import type { PriceBreakdown } from "@/lib/stickers/types";

export type DraftViewDeps = {
  admin: SupabaseClient;
  userId: string;
  presignDownload: (
    key: string,
    opts?: { expiresIn?: number },
  ) => Promise<string>;
};

export type DraftListItem = {
  orderId: string;
  guestToken: string;
  stickerCount: number;
  copies: number;
  breakdown: PriceBreakdown;
  updatedAtISO: string;
  thumbnailUrl: string | null;
};

const THUMB_TTL = 3600;

export async function getUserDrafts(
  deps: DraftViewDeps,
): Promise<DraftListItem[]> {
  const { data, error } = await deps.admin
    .from("orders")
    .select(
      "id, guest_token, copies, price_sheets, price_rate, price_setup, price_total, price_currency, updated_at, order_stickers(id, storage_key, sort_index)",
    )
    .eq("user_id", deps.userId)
    .is("confirmed_at", null)
    .order("updated_at", { ascending: false });

  if (error || !data) return [];

  return Promise.all(
    (data as Array<Record<string, unknown>>).map(async (row) => {
      const stickers = (
        (row.order_stickers as Array<{ storage_key: string; sort_index: number }>) ?? []
      )
        .slice()
        .sort((a, b) => a.sort_index - b.sort_index);
      const first = stickers[0];
      const thumbnailUrl = first
        ? await deps.presignDownload(first.storage_key, { expiresIn: THUMB_TTL })
        : null;
      return {
        orderId: row.id as string,
        guestToken: row.guest_token as string,
        stickerCount: stickers.length,
        copies: row.copies as number,
        breakdown: {
          uniqueCount: stickers.length,
          copies: row.copies as number,
          perSheet: 0,
          perSheetRate: row.price_rate as number,
          sheetsPerSet: 0,
          totalSheets: row.price_sheets as number,
          sheetsSubtotal: (row.price_total as number) - (row.price_setup as number),
          setupFee: row.price_setup as number,
          total: row.price_total as number,
          currency: row.price_currency as string,
        },
        updatedAtISO: row.updated_at as string,
        thumbnailUrl,
      };
    }),
  );
}

export type DraftEditSticker = {
  id: string;
  storageKey: string;
  filename: string;
  width: number | null;
  height: number | null;
  bytes: number;
  url: string;
};

export type DraftEditData = {
  orderId: string;
  copies: number;
  stickers: DraftEditSticker[];
};

export async function getDraftForEdit(
  orderId: string,
  deps: DraftViewDeps,
): Promise<DraftEditData | null> {
  const { data: order, error } = await deps.admin
    .from("orders")
    .select("id, copies, confirmed_at")
    .eq("id", orderId)
    .eq("user_id", deps.userId)
    .is("confirmed_at", null)
    .maybeSingle();
  if (error || !order) return null;

  const { data: stickers } = await deps.admin
    .from("order_stickers")
    .select("id, storage_key, original_filename, width, height, bytes, sort_index")
    .eq("order_id", orderId)
    .order("sort_index", { ascending: true });

  const list = await Promise.all(
    ((stickers as Array<Record<string, unknown>>) ?? []).map(async (s) => ({
      id: s.id as string,
      storageKey: s.storage_key as string,
      filename: s.original_filename as string,
      width: (s.width as number | null) ?? null,
      height: (s.height as number | null) ?? null,
      bytes: s.bytes as number,
      url: await deps.presignDownload(s.storage_key as string, { expiresIn: THUMB_TTL }),
    })),
  );

  return { orderId: order.id as string, copies: order.copies as number, stickers: list };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run lib/orders/draft-view.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add lib/orders/draft-view.ts lib/orders/draft-view.test.ts
git commit -m "feat(orders): getUserDrafts + getDraftForEdit read cores"
```

---

### Task 5: `discardDraft` core

**Files:**
- Create: `lib/orders/discard-draft.ts`
- Test: `lib/orders/discard-draft.test.ts`

**Interfaces:**
- Consumes: `orderPrefix` (`lib/storage/keys`).
- Produces: `DiscardDraftDeps = { admin: SupabaseClient; deletePrefix: (prefix: string) => Promise<void>; userId: string }`; `discardDraft(orderId: string, deps): Promise<{ ok: boolean; message?: string }>`.

- [ ] **Step 1: Write the failing test** — create `lib/orders/discard-draft.test.ts`:

```ts
vi.mock("server-only", () => ({}));

import { describe, it, expect, vi } from "vitest";
import { discardDraft } from "@/lib/orders/discard-draft";
import type { DiscardDraftDeps } from "@/lib/orders/discard-draft";

function makeAdmin(order: { id: string; confirmed_at: string | null } | null) {
  const deleted: string[] = [];
  return {
    _deleted: deleted,
    from() {
      return {
        select() { return this; },
        eq() { return this; },
        maybeSingle() { return Promise.resolve({ data: order, error: null }); },
        delete() { return { eq(_c: string, id: string) { deleted.push(id); return Promise.resolve({ error: null }); } }; },
      };
    },
  };
}

describe("discardDraft", () => {
  it("deletes the S3 prefix and the order row for the user's draft", async () => {
    const admin = makeAdmin({ id: "o1", confirmed_at: null });
    const deletePrefix = vi.fn(async () => {});
    const r = await discardDraft("o1", { admin: admin as unknown as DiscardDraftDeps["admin"], deletePrefix, userId: "u1" });
    expect(r).toEqual({ ok: true });
    expect(deletePrefix).toHaveBeenCalledWith("u_u1/o1/");
    expect(admin._deleted).toEqual(["o1"]);
  });

  it("is idempotent when the draft is already gone", async () => {
    const admin = makeAdmin(null);
    const deletePrefix = vi.fn(async () => {});
    const r = await discardDraft("o1", { admin: admin as unknown as DiscardDraftDeps["admin"], deletePrefix, userId: "u1" });
    expect(r).toEqual({ ok: true });
    expect(deletePrefix).not.toHaveBeenCalled();
  });

  it("refuses to discard a confirmed order", async () => {
    const admin = makeAdmin({ id: "o1", confirmed_at: "2026-01-01T00:00:00Z" });
    const r = await discardDraft("o1", { admin: admin as unknown as DiscardDraftDeps["admin"], deletePrefix: vi.fn(async () => {}), userId: "u1" });
    expect(r).toEqual({ ok: false, message: "already_finalized" });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run lib/orders/discard-draft.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement** — create `lib/orders/discard-draft.ts`:

```ts
import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { orderPrefix } from "@/lib/storage/keys";

export type DiscardDraftDeps = {
  admin: SupabaseClient;
  deletePrefix: (prefix: string) => Promise<void>;
  userId: string;
};

export async function discardDraft(
  orderId: string,
  deps: DiscardDraftDeps,
): Promise<{ ok: boolean; message?: string }> {
  const { data: order, error } = await deps.admin
    .from("orders")
    .select("id, confirmed_at")
    .eq("id", orderId)
    .eq("user_id", deps.userId)
    .maybeSingle();
  if (error) return { ok: false, message: "db_error" };
  if (!order) return { ok: true }; // idempotent — already gone / not ours
  if (order.confirmed_at != null) return { ok: false, message: "already_finalized" };

  // Drafts are never re-keyed, so the temp prefix is the whole order folder.
  await deps.deletePrefix(
    `${orderPrefix({ userId: deps.userId, guestToken: "", orderId })}/`,
  );

  const { error: delErr } = await deps.admin.from("orders").delete().eq("id", orderId);
  if (delErr) return { ok: false, message: "db_error" };
  return { ok: true };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run lib/orders/discard-draft.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add lib/orders/discard-draft.ts lib/orders/discard-draft.test.ts
git commit -m "feat(orders): discardDraft core"
```

---

### Task 6: Server-action wrappers

**Files:**
- Modify: `app/actions/stickers.ts`

**Interfaces:**
- Consumes: `updateDraft` (Task 3), `getUserDrafts`/`getDraftForEdit` (Task 4), `discardDraft` (Task 5); `presignUpload`, `presignDownload`, `deleteObjects`, `deletePrefix` (`lib/storage/s3`); `createServerSupabaseClient`, `createAdminSupabaseClient`.
- Produces (all `"use server"`):
  - `updateOrderDraft(input: { orderId: string; keepStickerIds: string[]; addStickers: StickerMeta[]; copies: number }): Promise<UpdateDraftResult>`
  - `getUserDrafts(): Promise<DraftListItem[]>`
  - `getDraftForEdit(orderId: string): Promise<DraftEditData | null>`
  - `discardDraft(orderId: string): Promise<{ ok: boolean; message?: string }>`

> These are thin glue wrappers covered indirectly by the core tests; no separate unit test (consistent with how `createOrderDraft`/`confirmOrder` actions are tested via their cores).

- [ ] **Step 1: Add imports** — in `app/actions/stickers.ts` add to the existing imports:

```ts
import { presignDownload, deleteObjects } from "@/lib/storage/s3";
import { updateDraft } from "@/lib/orders/update-draft";
import type { UpdateDraftResult } from "@/lib/orders/update-draft";
import {
  getUserDrafts as getUserDraftsCore,
  getDraftForEdit as getDraftForEditCore,
} from "@/lib/orders/draft-view";
import type { DraftListItem, DraftEditData } from "@/lib/orders/draft-view";
import { discardDraft as discardDraftCore } from "@/lib/orders/discard-draft";
```

(`presignUpload` and `deletePrefix` are already imported.)

- [ ] **Step 2: Append the four actions** to `app/actions/stickers.ts`:

```ts
export async function updateOrderDraft(input: {
  orderId: string;
  keepStickerIds: string[];
  addStickers: unknown[];
  copies: number;
}): Promise<UpdateDraftResult> {
  const supabase = await createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { ok: false, message: "not_signed_in" };

  return updateDraft(input, {
    admin: createAdminSupabaseClient(),
    presignUpload,
    deleteObjects: (keys) => deleteObjects(keys),
    userId: user.id,
  });
}

export async function getUserDrafts(): Promise<DraftListItem[]> {
  const supabase = await createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return [];

  return getUserDraftsCore({
    admin: createAdminSupabaseClient(),
    userId: user.id,
    presignDownload,
  });
}

export async function getDraftForEdit(
  orderId: string,
): Promise<DraftEditData | null> {
  const supabase = await createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;

  return getDraftForEditCore(orderId, {
    admin: createAdminSupabaseClient(),
    userId: user.id,
    presignDownload,
  });
}

export async function discardDraft(
  orderId: string,
): Promise<{ ok: boolean; message?: string }> {
  const supabase = await createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { ok: false, message: "not_signed_in" };

  return discardDraftCore(orderId, {
    admin: createAdminSupabaseClient(),
    deletePrefix,
    userId: user.id,
  });
}
```

- [ ] **Step 3: Typecheck**

Run: `npm run typecheck`
Expected: clean (0 errors).

- [ ] **Step 4: Commit**

```bash
git add app/actions/stickers.ts
git commit -m "feat(actions): updateOrderDraft, getUserDrafts, getDraftForEdit, discardDraft"
```

---

### Task 7: Builder — load a draft, mixed remote/local stickers, Save vs Continue

**Files:**
- Modify: `lib/stickers/types.ts` (add `remote`/`storageKey` to `LocalSticker`)
- Modify: `app/[lang]/stickers/page.tsx` (read `?draft`, pass `isSignedIn` + `initialDraft`)
- Modify: `components/stickers/sticker-tool.tsx`
- Modify: `app/[lang]/dictionaries/{he,en}.json` (add `stickers.builder.saveDraft`, `savedToast`)
- Test: `components/stickers/sticker-tool.test.tsx`

**Interfaces:**
- Consumes: `getDraftForEdit` (server, via page), `updateOrderDraft`/`createOrderDraft` (actions), `uploadFiles` (`lib/stickers/upload-client`), `DraftEditData` (`lib/orders/draft-view`).
- Produces: `StickerTool` props `{ dict; lang; isSignedIn: boolean; initialDraft?: DraftEditData | null }`; `LocalSticker` gains `remote?: boolean; storageKey?: string`.

- [ ] **Step 1: Extend `LocalSticker`** in `lib/stickers/types.ts` — add two optional fields to the existing type:

```ts
  width?: number;
  height?: number;
  /** True when this sticker is already uploaded (loaded from a saved draft). */
  remote?: boolean;
  /** S3 key for a remote sticker (its DB id is `id`). */
  storageKey?: string;
```

- [ ] **Step 2: Write the failing builder tests** — add to `components/stickers/sticker-tool.test.tsx` (the file already mocks `@/app/actions/stickers` and `next/navigation`). Extend the action mock to include `updateOrderDraft` and render with `initialDraft`. Add:

```ts
// In the existing vi.mock("@/app/actions/stickers", ...) add:
//   updateOrderDraft: (...a: unknown[]) => mockUpdateOrderDraft(...a),
// and declare: const mockUpdateOrderDraft = vi.fn();

it("signed-in: shows a Save draft button; guest: does not", () => {
  const { rerender } = render(<StickerTool dict={dict} lang="en" isSignedIn={false} />);
  expect(screen.queryByRole("button", { name: dict.builder.saveDraft })).toBeNull();
  rerender(<StickerTool dict={dict} lang="en" isSignedIn={true} />);
  expect(screen.getByRole("button", { name: dict.builder.saveDraft })).toBeInTheDocument();
});

it("loads an existing draft's stickers into the grid", () => {
  const initialDraft = {
    orderId: "o1", copies: 2,
    stickers: [{ id: "s1", storageKey: "u_u1/o1/s1.webp", filename: "a.webp", width: 64, height: 64, bytes: 100, url: "https://signed/a" }],
  };
  render(<StickerTool dict={dict} lang="en" isSignedIn={true} initialDraft={initialDraft} />);
  // remote thumbnail rendered (mocked next/image → <img>)
  expect(screen.getByAltText("a.webp")).toBeInTheDocument();
});
```

> Add the `builder` slice to the test `dict` fixture: `builder: { saveDraft: "Save draft", savedToast: "Draft saved" }`. (The component reads `dict.builder.saveDraft`.)

- [ ] **Step 3: Run tests to verify they fail**

Run: `npx vitest run components/stickers/sticker-tool.test.tsx -t "Save draft|loads an existing"`
Expected: FAIL — prop/`dict.builder` not present.

- [ ] **Step 4: Implement the dictionary copy** — in **both** `app/[lang]/dictionaries/he.json` and `en.json`, inside the `stickers` object add a `builder` slice (place it near `steps`):

en.json:
```json
    "builder": {
      "saveDraft": "Save draft",
      "savedToast": "Draft saved — you can finish it later from your account.",
      "loadError": "Couldn't load this draft. Please try again."
    },
```

he.json:
```json
    "builder": {
      "saveDraft": "שמירת טיוטה",
      "savedToast": "הטיוטה נשמרה — אפשר להשלים אותה מאוחר יותר מהחשבון שלך.",
      "loadError": "טעינת הטיוטה נכשלה. נסו שוב."
    },
```

- [ ] **Step 5: Implement the server page** — modify `app/[lang]/stickers/page.tsx` to read the session + `?draft` and pass props. It already renders `<StickerTool dict={...} lang={lang} />`; change to:

```tsx
// add imports
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { getDraftForEdit } from "@/app/actions/stickers";

// page signature already receives params; add searchParams:
//   { params, searchParams }: { params: Promise<{ lang: Locale }>; searchParams: Promise<{ draft?: string }> }
const supabase = await createServerSupabaseClient();
const { data: { user } } = await supabase.auth.getUser();
const { draft } = await searchParams;
const initialDraft = user && draft ? await getDraftForEdit(draft) : null;

// render:
<StickerTool dict={dict.stickers} lang={lang} isSignedIn={!!user} initialDraft={initialDraft} />
```

(Match the existing dict slice the page passes — it currently passes the stickers slice; keep that.)

- [ ] **Step 6: Implement `StickerTool`** — modify `components/stickers/sticker-tool.tsx`:

1. Update `Props`:
```tsx
type Props = {
  dict: Dictionary["stickers"];
  lang: "he" | "en";
  isSignedIn: boolean;
  initialDraft?: import("@/lib/orders/draft-view").DraftEditData | null;
};
export function StickerTool({ dict, lang, isSignedIn, initialDraft = null }: Props) {
```

2. Seed state from `initialDraft` and track the draft id:
```tsx
const [items, setItems] = useState<LocalSticker[]>(() =>
  (initialDraft?.stickers ?? []).map((s) => ({
    id: s.id, name: s.filename, objectUrl: s.url, bytes: s.bytes,
    status: "ready" as const, width: s.width ?? 0, height: s.height ?? 0,
    remote: true, storageKey: s.storageKey,
  })),
);
const [copies, setCopies] = useState(initialDraft?.copies ?? 1);
const draftIdRef = useRef<string | null>(initialDraft?.orderId ?? null);
```

3. In the unmount cleanup, only revoke object URLs for **local** stickers (remote ones are presigned URLs, not object URLs):
```tsx
for (const item of itemsRef.current) {
  if (!item.remote) URL.revokeObjectURL(item.objectUrl);
}
```
And in `handleRemove`, only `URL.revokeObjectURL` / `filesRef.delete` when `!item.remote`.

4. Add `import { updateOrderDraft } from "@/app/actions/stickers";` and a shared persist routine. Factor the current `handleContinue` body into `persistDraft()` returning the draft handle, branching on `draftIdRef.current`:

```tsx
// Returns { orderId, guestToken } on success, or null on failure (sets submitError).
async function persistDraft(): Promise<{ orderId: string; guestToken: string } | null> {
  const newLocal = items.filter((i) => !i.remote);
  const addStickers: StickerMeta[] = newLocal.map((item) => ({
    filename: item.name, bytes: item.bytes, contentType: "image/webp",
    width: item.width ?? 0, height: item.height ?? 0,
  }));

  setItems((prev) => prev.map((i) => (i.remote ? i : { ...i, status: "uploading", progress: 0 })));

  let uploads: { stickerId: string; key: string; url: string }[];
  let handle: { orderId: string; guestToken: string };

  if (draftIdRef.current) {
    const res = await updateOrderDraft({
      orderId: draftIdRef.current,
      keepStickerIds: items.filter((i) => i.remote).map((i) => i.id),
      addStickers,
      copies,
    });
    if (!res.ok) { setSubmitError(dict.errors[SERVER_ERROR_KEY[res.message ?? ""] ?? "serverError"]); return null; }
    uploads = res.uploads;
    handle = { orderId: res.orderId, guestToken: "" }; // guestToken not needed for editing; fetched for checkout below
  } else {
    const res = await createOrderDraft({ stickers: addStickers, copies });
    if (!res.ok) { setSubmitError(dict.errors[SERVER_ERROR_KEY[res.message ?? ""] ?? "serverError"]); return null; }
    uploads = res.uploads;
    handle = { orderId: res.orderId, guestToken: res.guestToken };
    draftIdRef.current = res.orderId;
  }

  // Upload only the NEW local files, pairing by stickerId order == newLocal order.
  const pairs = uploads.map((u, i) => ({ url: u.url, file: filesRef.current.get(newLocal[i].id) ?? new File([], newLocal[i].name) }));
  const results = await uploadFiles(pairs, { onEach: () => {} });
  if (results.some((r) => !r.ok)) { setSubmitError(dict.errors.uploadFailed); return null; }

  // Mark uploaded local stickers as remote now (so a second save doesn't re-add them).
  setItems((prev) => prev.map((i) => (i.remote ? i : { ...i, status: "ready" as const, remote: true })));
  return handle;
}
```

Then:
```tsx
async function handleContinue() {
  if (items.length === 0 || submitting) return;
  setSubmitting(true); setSubmitError(null);
  const handle = await persistDraft();
  if (!handle) { setSubmitting(false); return; }
  sessionStorage.setItem("linecut_order", JSON.stringify({ orderId: handle.orderId, guestToken: handle.guestToken }));
  router.push(`/${lang}/stickers/checkout`);
}

async function handleSaveDraft() {
  if (items.length === 0 || submitting) return;
  setSubmitting(true); setSubmitError(null);
  const handle = await persistDraft();
  setSubmitting(false);
  if (handle) router.push(`/${lang}/account/orders`);
}
```

> Note: when editing an existing draft, `updateOrderDraft` doesn't return `guestToken`. For "Continue to checkout" on a loaded draft, fetch it via the account "Continue to checkout" path (Task 8) which already has the guestToken, OR extend `updateOrderDraft`'s result to include it. **Decision for this plan:** have `updateOrderDraft` also return `guestToken` (add `guest_token` to the `select` in Task 3's load step and include it in the `ok` result + type). Update Task 3's return type to `{ ok: true; orderId; guestToken; uploads }` and read it from the loaded order row. (Apply this small addition when implementing Task 3 if editing→checkout is exercised.)

5. Render a **Save draft** button next to Continue, only when `isSignedIn`:
```tsx
{isSignedIn && (
  <Button type="button" variant="secondary" disabled={submitting || !hasItems} onClick={handleSaveDraft} className="min-h-[44px]">
    {dict.builder.saveDraft}
  </Button>
)}
```

- [ ] **Step 7: Run tests + typecheck**

Run: `npx vitest run components/stickers/sticker-tool.test.tsx && npm run typecheck`
Expected: PASS + clean. (Update any existing `StickerTool` render in the test to pass `isSignedIn`.)

- [ ] **Step 8: Commit**

```bash
git add lib/stickers/types.ts app/[lang]/stickers/page.tsx components/stickers/sticker-tool.tsx app/[lang]/dictionaries/he.json app/[lang]/dictionaries/en.json components/stickers/sticker-tool.test.tsx
git commit -m "feat(stickers): load+edit saved drafts in the builder; Save draft button"
```

---

### Task 8: Account "In-progress" drafts section

**Files:**
- Create: `components/stickers/draft-list.tsx`
- Modify: `app/[lang]/account/orders/page.tsx`
- Modify: `app/[lang]/dictionaries/{he,en}.json` (add `stickers.drafts.*`)
- Test: `components/stickers/draft-list.test.tsx`

**Interfaces:**
- Consumes: `getUserDrafts`/`discardDraft` (actions), `DraftListItem` (`lib/orders/draft-view`), `formatMoney` (`lib/stickers/format`).
- Produces: `DraftList` component `{ drafts: DraftListItem[]; dict: Dictionary["stickers"]; lang: Locale }`.

- [ ] **Step 1: Add dictionary copy** — in **both** locales, inside `stickers` add a `drafts` slice:

en.json:
```json
    "drafts": {
      "heading": "In-progress orders",
      "empty": "No saved drafts.",
      "stickerCount": "{count} stickers · {copies} copies",
      "continueEditing": "Continue editing",
      "continueCheckout": "Continue to checkout",
      "discard": "Discard",
      "discardConfirm": "Discard this saved draft? This can't be undone."
    },
```

he.json:
```json
    "drafts": {
      "heading": "הזמנות בתהליך",
      "empty": "אין טיוטות שמורות.",
      "stickerCount": "{count} מדבקות · {copies} עותקים",
      "continueEditing": "המשך עריכה",
      "continueCheckout": "המשך לתשלום",
      "discard": "מחיקה",
      "discardConfirm": "למחוק את הטיוטה השמורה? לא ניתן לשחזר."
    },
```

- [ ] **Step 2: Write the failing test** — create `components/stickers/draft-list.test.tsx`:

```ts
import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { DraftList } from "@/components/stickers/draft-list";

vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }) }));
vi.mock("next/image", () => ({ default: ({ alt, src }: { alt: string; src: string }) => <img alt={alt} src={src} /> }));
const mockDiscard = vi.fn(async () => ({ ok: true }));
vi.mock("@/app/actions/stickers", () => ({ discardDraft: (...a: unknown[]) => mockDiscard(...a) }));

const dict = {
  drafts: { heading: "In-progress", empty: "No saved drafts.", stickerCount: "{count} stickers · {copies} copies", continueEditing: "Continue editing", continueCheckout: "Continue to checkout", discard: "Discard", discardConfirm: "Sure?" },
} as unknown as import("@/lib/dictionary").Dictionary["stickers"];

const drafts = [{ orderId: "o1", guestToken: "gt1", stickerCount: 3, copies: 2, breakdown: { uniqueCount: 3, copies: 2, perSheet: 0, perSheetRate: 0, sheetsPerSet: 0, totalSheets: 0, sheetsSubtotal: 0, setupFee: 0, total: 0, currency: "ILS" }, updatedAtISO: "2026-06-24T10:00:00.000Z", thumbnailUrl: "https://signed/t" }];

describe("DraftList", () => {
  it("renders each draft with a Continue editing link to the builder", () => {
    render(<DraftList drafts={drafts} dict={dict} lang="en" />);
    const link = screen.getByRole("link", { name: "Continue editing" });
    expect(link).toHaveAttribute("href", "/en/stickers?draft=o1");
  });

  it("shows the empty state when there are no drafts", () => {
    render(<DraftList drafts={[]} dict={dict} lang="en" />);
    expect(screen.getByText("No saved drafts.")).toBeInTheDocument();
  });

  it("calls discardDraft after confirm", () => {
    vi.spyOn(window, "confirm").mockReturnValue(true);
    render(<DraftList drafts={drafts} dict={dict} lang="en" />);
    fireEvent.click(screen.getByRole("button", { name: "Discard" }));
    expect(mockDiscard).toHaveBeenCalledWith("o1");
  });
});
```

- [ ] **Step 3: Run test to verify it fails**

Run: `npx vitest run components/stickers/draft-list.test.tsx`
Expected: FAIL — component not found.

- [ ] **Step 4: Implement `DraftList`** — create `components/stickers/draft-list.tsx` (client component; follow `order-history-list.tsx` for styling/tokens):

```tsx
"use client";

import { useTransition } from "react";
import Link from "next/link";
import Image from "next/image";
import { useRouter } from "next/navigation";
import type { Dictionary } from "@/lib/dictionary";
import type { Locale } from "@/lib/i18n";
import type { DraftListItem } from "@/lib/orders/draft-view";
import { discardDraft } from "@/app/actions/stickers";
import { interpolate } from "@/lib/stickers/format";
import { Button } from "@/components/ui/button";

export function DraftList({
  drafts,
  dict,
  lang,
}: {
  drafts: DraftListItem[];
  dict: Dictionary["stickers"];
  lang: Locale;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const d = dict.drafts;

  if (drafts.length === 0) {
    return <p className="text-sm text-muted">{d.empty}</p>;
  }

  function onDiscard(orderId: string) {
    if (!window.confirm(d.discardConfirm)) return;
    startTransition(async () => {
      await discardDraft(orderId);
      router.refresh();
    });
  }

  function onCheckout(orderId: string, guestToken: string) {
    sessionStorage.setItem("linecut_order", JSON.stringify({ orderId, guestToken }));
    router.push(`/${lang}/stickers/checkout`);
  }

  return (
    <ul className="flex flex-col gap-4">
      {drafts.map((draft) => (
        <li key={draft.orderId} className="flex items-center gap-4 rounded-md border border-line bg-paper p-4">
          {draft.thumbnailUrl && (
            <Image src={draft.thumbnailUrl} alt="" width={56} height={56} className="rounded object-cover" />
          )}
          <div className="flex-1">
            <p className="text-sm text-ink">
              {interpolate(d.stickerCount, { count: draft.stickerCount, copies: draft.copies })}
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Link
              href={`/${lang}/stickers?draft=${draft.orderId}`}
              className="text-accent underline underline-offset-2 hover:text-accent/80"
            >
              {d.continueEditing}
            </Link>
            <Button type="button" variant="secondary" onClick={() => onCheckout(draft.orderId, draft.guestToken)}>
              {d.continueCheckout}
            </Button>
            <Button type="button" variant="ghost" disabled={isPending} onClick={() => onDiscard(draft.orderId)}>
              {d.discard}
            </Button>
          </div>
        </li>
      ))}
    </ul>
  );
}
```

(If `variant="ghost"` isn't available on `Button`, use `"secondary"` — check `components/ui/button.tsx`.)

- [ ] **Step 5: Mount it on the account page** — modify `app/[lang]/account/orders/page.tsx` to fetch drafts and render the section above the confirmed-orders list:

```tsx
import { getUserDrafts } from "@/app/actions/stickers";
import { DraftList } from "@/components/stickers/draft-list";

// inside the component, alongside the existing getUserOrders() call:
const drafts = await getUserDrafts();

// in JSX, above the confirmed orders block:
<section className="mb-10">
  <h2 className="mb-4 font-display text-xl font-bold text-ink">{dict.stickers.drafts.heading}</h2>
  <DraftList drafts={drafts} dict={dict.stickers} lang={lang} />
</section>
```

(Match the page's existing `dict` access pattern — it already loads the dictionary; pass the `stickers` slice.)

- [ ] **Step 6: Run tests + parity + typecheck**

Run: `npx vitest run components/stickers/draft-list.test.tsx "app/[lang]/dictionaries.test.ts" && npm run typecheck`
Expected: PASS + parity green + clean.

- [ ] **Step 7: Commit**

```bash
git add components/stickers/draft-list.tsx "app/[lang]/account/orders/page.tsx" app/[lang]/dictionaries/he.json app/[lang]/dictionaries/en.json components/stickers/draft-list.test.tsx
git commit -m "feat(account): in-progress drafts section (continue/checkout/discard)"
```

---

### Task 9: Full verification

- [ ] **Step 1: Full test suite**

Run: `npx vitest run`
Expected: all pass.

- [ ] **Step 2: Typecheck + build**

Run: `npm run typecheck && npm run build`
Expected: clean + build succeeds.

- [ ] **Step 3: Update the `sticker-shop` skill** — document the new draft lifecycle (Save draft signed-in only; `updateDraft`/`getUserDrafts`/`getDraftForEdit`/`discardDraft` cores; builder `?draft=` load; account In-progress section; drafts stay temp-keyed; cleanup cron targets only guest drafts). Edit `.claude/skills/sticker-shop/SKILL.md` (File Map, Order Lifecycle, Roadmap).

- [ ] **Step 4: Commit**

```bash
git add .claude/skills/sticker-shop/SKILL.md
git commit -m "docs(skill): document saved/editable drafts"
```

---

## Self-Review

**Spec coverage:**
- Explicit Save draft, signed-in only → Tasks 6 (auth guard), 7 (button gated on `isSignedIn`). ✓
- Multiple drafts + account list → Tasks 4 (`getUserDrafts`), 8 (`DraftList`). ✓
- Edit (add/remove/quantity), price re-snapshot → Task 3. ✓
- Continue-to-checkout also persists → Task 7 (`handleContinue` → `persistDraft`). ✓
- Discard → Tasks 5, 8. ✓
- Locked at confirm (`already_finalized`) → Tasks 3, 5. ✓
- Drafts stay temp-keyed; re-key only at confirm → unchanged (no task touches confirm). ✓
- Guests unchanged → Task 7 gates Save on `isSignedIn`; `handleContinue` keeps today's behavior. ✓
- `deleteObjects` helper → Task 1. ✓
- Dictionary parity for new copy → Tasks 7, 8 edit both locales; Task 8 runs the parity test. ✓

**Placeholder scan:** No TBD/TODO; all code blocks complete. The one cross-task note (return `guestToken` from `updateOrderDraft` for editing→checkout) is made explicit in Task 7 Step 6 with the exact change to apply in Task 3.

**Type consistency:** `UpdateDraftResult`, `DraftListItem`, `DraftEditData`, `DraftViewDeps`, `DiscardDraftDeps` names match across Tasks 3–8. `LocalSticker.remote/storageKey` added in Task 7 Step 1 and consumed in the same task. Action names (`updateOrderDraft`, `getUserDrafts`, `getDraftForEdit`, `discardDraft`) consistent in Tasks 6–8.

**Note carried into implementation:** If editing→checkout is exercised, apply the Task 7 Step 6 addendum (add `guest_token` to Task 3's order `select` and include it in the `ok` result + `UpdateDraftResult` type).
