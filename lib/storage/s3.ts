import "server-only";
import {
  S3Client,
  PutObjectCommand,
  GetObjectCommand,
  HeadObjectCommand,
  ListObjectsV2Command,
  DeleteObjectsCommand,
  CopyObjectCommand,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";

let _client: S3Client | undefined;

function getClient(): S3Client {
  if (!_client) {
    _client = new S3Client({ region: process.env.AWS_REGION });
  }
  return _client;
}

/**
 * Buckets:
 *   • "orders"   — every sticker order (drafts + confirmed). Browser uploads here.
 *   • "paid"     — sticker orders whose payment succeeded; the order folder is
 *                  copied here and the receipt is written into it.
 *   • "products" — PUBLIC-READ store product images. The owner uploads here via
 *                  a presigned PUT (same IAM user); the storefront reads the
 *                  public object URL directly (see productImagePublicUrl).
 */
export type S3Bucket = "orders" | "paid" | "products";

function getOrdersBucket(): string {
  const bucket = process.env.S3_STICKERS_BUCKET;
  if (!bucket) {
    throw new Error("S3_STICKERS_BUCKET env var is not set");
  }
  return bucket;
}

function getPaidBucket(): string {
  const bucket = process.env.S3_STICKERS_PAID_BUCKET;
  if (!bucket) {
    throw new Error("S3_STICKERS_PAID_BUCKET env var is not set");
  }
  return bucket;
}

function getProductsBucket(): string {
  const bucket = process.env.S3_PRODUCTS_BUCKET;
  if (!bucket) {
    throw new Error("S3_PRODUCTS_BUCKET env var is not set");
  }
  return bucket;
}

function resolveBucket(bucket?: S3Bucket): string {
  if (bucket === "paid") return getPaidBucket();
  if (bucket === "products") return getProductsBucket();
  return getOrdersBucket();
}

/**
 * Public URL for a product-images object. The bucket is public-read, so the
 * storefront serves this URL directly (no presign). Prefer S3_PRODUCTS_PUBLIC_URL
 * (a CloudFront/custom-domain base) when set; otherwise build the S3 URL from the
 * bucket + region.
 */
export function productImagePublicUrl(key: string): string {
  const encodedKey = key.split("/").map(encodeURIComponent).join("/");
  const base = process.env.S3_PRODUCTS_PUBLIC_URL;
  if (base) return `${base.replace(/\/+$/, "")}/${encodedKey}`;
  const bucket = process.env.S3_PRODUCTS_BUCKET;
  const region = process.env.AWS_REGION;
  if (!bucket || !region) {
    throw new Error("S3_PRODUCTS_BUCKET / AWS_REGION env vars are not set");
  }
  return `https://${bucket}.s3.${region}.amazonaws.com/${encodedKey}`;
}

export async function presignUpload(
  key: string,
  opts?: { expiresIn?: number; contentType?: string; bucket?: S3Bucket }
): Promise<string> {
  const Bucket = resolveBucket(opts?.bucket);
  const cmd = new PutObjectCommand({
    Bucket,
    Key: key,
    ContentType: opts?.contentType ?? "image/webp",
  });
  return getSignedUrl(getClient(), cmd, { expiresIn: opts?.expiresIn ?? 900 });
}

export async function presignDownload(
  key: string,
  opts?: { expiresIn?: number; bucket?: S3Bucket }
): Promise<string> {
  const Bucket = resolveBucket(opts?.bucket);
  const cmd = new GetObjectCommand({ Bucket, Key: key });
  const ttl =
    opts?.expiresIn ?? (Number(process.env.ORDER_FILES_LINK_TTL) || 604800);
  return getSignedUrl(getClient(), cmd, { expiresIn: ttl });
}

export async function objectExists(
  key: string,
  opts?: { bucket?: S3Bucket }
): Promise<boolean> {
  const Bucket = resolveBucket(opts?.bucket);
  try {
    await getClient().send(new HeadObjectCommand({ Bucket, Key: key }));
    return true;
  } catch (err: unknown) {
    const e = err as { name?: string; $metadata?: { httpStatusCode?: number } };
    if (e?.name === "NotFound" || e?.$metadata?.httpStatusCode === 404) {
      return false;
    }
    throw err;
  }
}

/** Write bytes/string directly server-side (metadata PDF, receipt). */
export async function putObject(
  key: string,
  body: Uint8Array | string,
  opts?: { contentType?: string; bucket?: S3Bucket }
): Promise<void> {
  const Bucket = resolveBucket(opts?.bucket);
  await getClient().send(
    new PutObjectCommand({
      Bucket,
      Key: key,
      Body: body,
      ContentType: opts?.contentType ?? "application/octet-stream",
    })
  );
}

/** Build a URL-encoded CopySource (`bucket/key`) preserving path separators. */
function copySource(bucket: string, key: string): string {
  const encoded = key.split("/").map(encodeURIComponent).join("/");
  return `${bucket}/${encoded}`;
}

/** Copy a single object (within or across buckets). Idempotent. */
export async function copyObject(
  srcKey: string,
  dstKey: string,
  opts?: { srcBucket?: S3Bucket; dstBucket?: S3Bucket }
): Promise<void> {
  const SrcBucket = resolveBucket(opts?.srcBucket);
  const DstBucket = resolveBucket(opts?.dstBucket);
  await getClient().send(
    new CopyObjectCommand({
      Bucket: DstBucket,
      Key: dstKey,
      CopySource: copySource(SrcBucket, srcKey),
    })
  );
}

/**
 * Copy every object under `srcPrefix` to `dstPrefix`, rewriting the prefix.
 * Pagination-aware. Used to copy a whole order folder orders→paid.
 */
export async function copyPrefix(
  srcPrefix: string,
  dstPrefix: string,
  opts?: { srcBucket?: S3Bucket; dstBucket?: S3Bucket }
): Promise<void> {
  const SrcBucket = resolveBucket(opts?.srcBucket);
  const DstBucket = resolveBucket(opts?.dstBucket);
  const client = getClient();
  let continuationToken: string | undefined;

  do {
    const listResp = await client.send(
      new ListObjectsV2Command({
        Bucket: SrcBucket,
        Prefix: srcPrefix,
        ...(continuationToken ? { ContinuationToken: continuationToken } : {}),
      })
    );

    for (const obj of listResp.Contents ?? []) {
      const srcKey = obj.Key as string;
      const dstKey = dstPrefix + srcKey.slice(srcPrefix.length);
      await client.send(
        new CopyObjectCommand({
          Bucket: DstBucket,
          Key: dstKey,
          CopySource: copySource(SrcBucket, srcKey),
        })
      );
    }

    continuationToken = listResp.IsTruncated
      ? listResp.NextContinuationToken
      : undefined;
  } while (continuationToken);
}

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

export async function deletePrefix(
  prefix: string,
  opts?: { bucket?: S3Bucket }
): Promise<void> {
  const Bucket = resolveBucket(opts?.bucket);
  const client = getClient();
  let continuationToken: string | undefined;

  do {
    const listResp = await client.send(
      new ListObjectsV2Command({
        Bucket,
        Prefix: prefix,
        ...(continuationToken
          ? { ContinuationToken: continuationToken }
          : {}),
      })
    );

    const keys = listResp.Contents?.map((obj) => ({ Key: obj.Key as string }));

    if (keys && keys.length > 0) {
      await client.send(
        new DeleteObjectsCommand({
          Bucket,
          Delete: { Objects: keys },
        })
      );
    }

    continuationToken = listResp.IsTruncated
      ? listResp.NextContinuationToken
      : undefined;
  } while (continuationToken);
}
