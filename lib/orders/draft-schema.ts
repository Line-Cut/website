import { z } from "zod";
import { stickerConfig } from "@/lib/stickers/sticker-config";

const stickerMetaSchema = z.object({
  filename: z.string().min(1, "required"),
  bytes: z
    .number()
    .int()
    .gt(0, "must be > 0")
    .max(stickerConfig.maxFileBytes, "file_too_large"),
  contentType: z
    .string()
    .refine((v) => v === stickerConfig.acceptedMime, { message: "not_webp" }),
  width: z.number().int().min(0),
  height: z.number().int().min(0),
});

export const draftSchema = z.object({
  stickers: z
    .array(stickerMetaSchema)
    .min(1, "min_one_sticker")
    .max(stickerConfig.maxStickers, "too_many_stickers"),
  copies: z.number().int().min(1, "copies_min_1"),
});

export type DraftInput = z.infer<typeof draftSchema>;

export function parseDraft(
  data: unknown,
):
  | { success: true; data: DraftInput }
  | { success: false; errors: Record<string, string> } {
  const result = draftSchema.safeParse(data);
  if (result.success) return { success: true, data: result.data };

  const errors: Record<string, string> = {};
  for (const issue of result.error.issues) {
    // Build a key like "stickers.0.contentType" for array item errors
    const key =
      issue.path.length > 0
        ? issue.path.map(String).join(".")
        : "form";
    if (!errors[key]) errors[key] = issue.message;
  }
  return { success: false, errors };
}

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
