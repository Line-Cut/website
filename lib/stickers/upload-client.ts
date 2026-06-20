"use client";

/**
 * Browser-only S3 presigned-URL upload helpers.
 * No server-only imports; safe to import in client components.
 */

/**
 * PUT a single file to a presigned S3 URL.
 * Throws if the response is not ok.
 */
export async function putToPresignedUrl(
  url: string,
  file: File,
  opts?: { signal?: AbortSignal },
): Promise<void> {
  const res = await fetch(url, {
    method: "PUT",
    body: file,
    headers: { "Content-Type": "image/webp" },
    signal: opts?.signal,
  });
  if (!res.ok) {
    throw new Error(`Upload failed: ${res.status} ${res.statusText}`);
  }
}

export type UploadResult = { index: number; ok: boolean };

/**
 * Upload multiple files to presigned URLs with bounded concurrency and
 * one automatic retry per file on failure.
 *
 * Never throws — results are per-index `{ index, ok }`.
 *
 * @param pairs    Array of `{ url, file }` pairs in order.
 * @param opts.concurrency  Max simultaneous uploads (default 4).
 * @param opts.onEach       Called once per file as it settles.
 */
export async function uploadFiles(
  pairs: { url: string; file: File }[],
  opts?: {
    concurrency?: number;
    onEach?: (index: number, status: "done" | "error") => void;
  },
): Promise<UploadResult[]> {
  const concurrency = opts?.concurrency ?? 4;
  const onEach = opts?.onEach;

  const results: UploadResult[] = new Array(pairs.length);
  let nextIndex = 0;

  async function worker(): Promise<void> {
    while (nextIndex < pairs.length) {
      const i = nextIndex++;
      const { url, file } = pairs[i];

      let ok = false;
      try {
        await putToPresignedUrl(url, file);
        ok = true;
      } catch {
        // One retry
        try {
          await putToPresignedUrl(url, file);
          ok = true;
        } catch {
          ok = false;
        }
      }

      results[i] = { index: i, ok };
      onEach?.(i, ok ? "done" : "error");
    }
  }

  // Spawn `concurrency` workers and race them all
  const workers: Promise<void>[] = [];
  for (let w = 0; w < Math.min(concurrency, pairs.length); w++) {
    workers.push(worker());
  }
  await Promise.all(workers);

  return results;
}
