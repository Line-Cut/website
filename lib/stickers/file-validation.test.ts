import { describe, it, expect } from "vitest";
import { validateFiles } from "@/lib/stickers/file-validation";
import { stickerConfig } from "@/lib/stickers/sticker-config";
import type { StickerConfig } from "@/lib/stickers/sticker-config";

const WEBP_MIME = "image/webp";
const PNG_MIME = "image/png";

// Helper to create a webp File with specific byte size
function makeFile(
  name: string,
  type: string,
  bytes: number = 100,
): File {
  return new File([new Uint8Array(bytes)], name, { type });
}

describe("validateFiles", () => {
  it("rejects non-webp files with reason 'type'", () => {
    const pngFile = makeFile("image.png", PNG_MIME, 100);
    const result = validateFiles([pngFile], 0);
    expect(result.accepted).toHaveLength(0);
    expect(result.rejected).toHaveLength(1);
    expect(result.rejected[0].reason).toBe("type");
    expect(result.rejected[0].file).toBe(pngFile);
  });

  it("rejects webp files over maxFileBytes with reason 'tooBig'", () => {
    const bigFile = makeFile("big.webp", WEBP_MIME, stickerConfig.maxFileBytes + 1);
    const result = validateFiles([bigFile], 0);
    expect(result.accepted).toHaveLength(0);
    expect(result.rejected).toHaveLength(1);
    expect(result.rejected[0].reason).toBe("tooBig");
    expect(result.rejected[0].file).toBe(bigFile);
  });

  it("accepts a valid webp file under the size cap", () => {
    const goodFile = makeFile("sticker.webp", WEBP_MIME, 1024);
    const result = validateFiles([goodFile], 0);
    expect(result.accepted).toHaveLength(1);
    expect(result.accepted[0]).toBe(goodFile);
    expect(result.rejected).toHaveLength(0);
  });

  it("rejects overflow files with reason 'overLimit' when existingCount + accepted would exceed maxStickers", () => {
    const smallCfg: StickerConfig = { ...stickerConfig, maxStickers: 2 };
    // existingCount=1, so only 1 more can be accepted
    const file1 = makeFile("a.webp", WEBP_MIME, 100);
    const file2 = makeFile("b.webp", WEBP_MIME, 100);
    const file3 = makeFile("c.webp", WEBP_MIME, 100);

    const result = validateFiles([file1, file2, file3], 1, smallCfg);
    expect(result.accepted).toHaveLength(1);
    expect(result.accepted[0]).toBe(file1);
    expect(result.rejected).toHaveLength(2);
    expect(result.rejected[0].file).toBe(file2);
    expect(result.rejected[0].reason).toBe("overLimit");
    expect(result.rejected[1].file).toBe(file3);
    expect(result.rejected[1].reason).toBe("overLimit");
  });

  it("preserves input order in accepted list", () => {
    const smallCfg: StickerConfig = { ...stickerConfig, maxStickers: 3 };
    const file1 = makeFile("first.webp", WEBP_MIME, 100);
    const file2 = makeFile("second.webp", WEBP_MIME, 100);
    const file3 = makeFile("third.webp", WEBP_MIME, 100);

    const result = validateFiles([file1, file2, file3], 0, smallCfg);
    expect(result.accepted).toEqual([file1, file2, file3]);
  });

  it("type check happens before size check", () => {
    // A non-webp file that is also huge should be rejected as 'type', not 'tooBig'
    const bigPng = makeFile("huge.png", PNG_MIME, stickerConfig.maxFileBytes + 1);
    const result = validateFiles([bigPng], 0);
    expect(result.rejected[0].reason).toBe("type");
  });

  it("handles empty input array", () => {
    const result = validateFiles([], 0);
    expect(result.accepted).toHaveLength(0);
    expect(result.rejected).toHaveLength(0);
  });

  it("when existingCount already equals maxStickers, all new files are overLimit", () => {
    const smallCfg: StickerConfig = { ...stickerConfig, maxStickers: 2 };
    const file1 = makeFile("a.webp", WEBP_MIME, 100);
    const file2 = makeFile("b.webp", WEBP_MIME, 100);

    const result = validateFiles([file1, file2], 2, smallCfg);
    expect(result.accepted).toHaveLength(0);
    expect(result.rejected).toHaveLength(2);
    expect(result.rejected.every((r) => r.reason === "overLimit")).toBe(true);
  });
});
