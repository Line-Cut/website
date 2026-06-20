import { stickerConfig } from "@/lib/stickers/sticker-config";
import type { StickerConfig } from "@/lib/stickers/sticker-config";

export type ValidationResult = {
  accepted: File[];
  rejected: { file: File; reason: "type" | "tooBig" | "overLimit" }[];
};

/**
 * Validate an array of incoming File objects against the sticker config rules.
 *
 * Order of checks per file:
 * 1. Reject if MIME type !== cfg.acceptedMime (reason: "type")
 * 2. Reject if file.size > cfg.maxFileBytes (reason: "tooBig")
 * 3. Accept, but cap so existingCount + accepted.length <= cfg.maxStickers
 *    (further valid files → reason: "overLimit")
 *
 * Input order is preserved across both accepted and rejected lists.
 *
 * @param incoming      - files chosen/dropped by the user
 * @param existingCount - number of stickers already in the current session
 * @param cfg           - sticker config (defaults to stickerConfig)
 */
export function validateFiles(
  incoming: File[],
  existingCount: number,
  cfg: StickerConfig = stickerConfig,
): ValidationResult {
  const accepted: File[] = [];
  const rejected: { file: File; reason: "type" | "tooBig" | "overLimit" }[] =
    [];

  for (const file of incoming) {
    if (file.type !== cfg.acceptedMime) {
      rejected.push({ file, reason: "type" });
      continue;
    }

    if (file.size > cfg.maxFileBytes) {
      rejected.push({ file, reason: "tooBig" });
      continue;
    }

    if (existingCount + accepted.length >= cfg.maxStickers) {
      rejected.push({ file, reason: "overLimit" });
      continue;
    }

    accepted.push(file);
  }

  return { accepted, rejected };
}
