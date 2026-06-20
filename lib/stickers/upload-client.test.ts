import { describe, it, expect, vi, beforeEach } from "vitest";
import { putToPresignedUrl, uploadFiles } from "@/lib/stickers/upload-client";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeFile(name = "sticker.webp") {
  return new File([new Uint8Array(64)], name, { type: "image/webp" });
}

// ---------------------------------------------------------------------------
// putToPresignedUrl
// ---------------------------------------------------------------------------

describe("putToPresignedUrl", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("calls fetch with PUT + Content-Type image/webp and resolves on 200", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true, status: 200 }));
    const file = makeFile();
    await expect(putToPresignedUrl("https://s3.example/key", file)).resolves.toBeUndefined();

    expect(fetch).toHaveBeenCalledWith(
      "https://s3.example/key",
      expect.objectContaining({
        method: "PUT",
        body: file,
        headers: { "Content-Type": "image/webp" },
      }),
    );
  });

  it("throws on non-ok response", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: false, status: 403, statusText: "Forbidden" }));
    await expect(putToPresignedUrl("https://s3.example/key", makeFile())).rejects.toThrow("403");
  });
});

// ---------------------------------------------------------------------------
// uploadFiles
// ---------------------------------------------------------------------------

describe("uploadFiles", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("returns ok:true when all uploads succeed", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true }));
    const pairs = [
      { url: "https://s3/1", file: makeFile("a.webp") },
      { url: "https://s3/2", file: makeFile("b.webp") },
    ];
    const results = await uploadFiles(pairs);
    expect(results).toHaveLength(2);
    expect(results.every((r) => r.ok)).toBe(true);
  });

  it("calls onEach for each file that settles", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true }));
    const onEach = vi.fn();
    await uploadFiles([{ url: "https://s3/1", file: makeFile() }], { onEach });
    expect(onEach).toHaveBeenCalledWith(0, "done");
  });

  it("retries once on failure and reports ok:true if retry succeeds", async () => {
    // First call fails, second succeeds
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({ ok: false, status: 500, statusText: "Error" })
      .mockResolvedValueOnce({ ok: true });

    vi.stubGlobal("fetch", fetchMock);

    const results = await uploadFiles([{ url: "https://s3/1", file: makeFile() }]);
    expect(results[0].ok).toBe(true);
    // fetch was called twice (initial + retry)
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("reports ok:false after two failures (initial + 1 retry)", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({ ok: false, status: 500, statusText: "Error" }),
    );
    const onEach = vi.fn();
    const results = await uploadFiles([{ url: "https://s3/1", file: makeFile() }], { onEach });
    expect(results[0].ok).toBe(false);
    expect(onEach).toHaveBeenCalledWith(0, "error");
    // fetch called twice (initial + retry)
    expect(fetch).toHaveBeenCalledTimes(2);
  });

  it("never throws even when all uploads fail", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("network")));
    const pairs = [
      { url: "https://s3/1", file: makeFile("a.webp") },
      { url: "https://s3/2", file: makeFile("b.webp") },
    ];
    const results = await expect(uploadFiles(pairs)).resolves.toBeDefined();
    void results;
  });

  it("respects concurrency cap", async () => {
    let inFlight = 0;
    let maxInFlight = 0;

    const fetchMock = vi.fn().mockImplementation(async () => {
      inFlight++;
      if (inFlight > maxInFlight) maxInFlight = inFlight;
      // Simulate async work
      await new Promise<void>((resolve) => setTimeout(resolve, 5));
      inFlight--;
      return { ok: true };
    });

    vi.stubGlobal("fetch", fetchMock);

    const pairs = Array.from({ length: 10 }, (_, i) => ({
      url: `https://s3/${i}`,
      file: makeFile(`s${i}.webp`),
    }));

    await uploadFiles(pairs, { concurrency: 3 });

    // At no point should more than 3 be in flight simultaneously
    expect(maxInFlight).toBeLessThanOrEqual(3);
  });

  it("returns results with correct indices", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true }));
    const pairs = [
      { url: "https://s3/0", file: makeFile("a.webp") },
      { url: "https://s3/1", file: makeFile("b.webp") },
      { url: "https://s3/2", file: makeFile("c.webp") },
    ];
    const results = await uploadFiles(pairs);
    expect(results.map((r) => r.index)).toEqual([0, 1, 2]);
  });

  it("handles empty array without throwing", async () => {
    vi.stubGlobal("fetch", vi.fn());
    const results = await uploadFiles([]);
    expect(results).toHaveLength(0);
    expect(fetch).not.toHaveBeenCalled();
  });
});
