import "server-only";
import {
  S3Client,
  PutObjectCommand,
  GetObjectCommand,
  HeadObjectCommand,
  ListObjectsV2Command,
  DeleteObjectsCommand,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";

let _client: S3Client | undefined;

function getClient(): S3Client {
  if (!_client) {
    _client = new S3Client({ region: process.env.AWS_REGION });
  }
  return _client;
}

function getBucket(): string {
  const bucket = process.env.S3_STICKERS_BUCKET;
  if (!bucket) {
    throw new Error("S3_STICKERS_BUCKET env var is not set");
  }
  return bucket;
}

export async function presignUpload(
  key: string,
  opts?: { expiresIn?: number; contentType?: string }
): Promise<string> {
  const Bucket = getBucket();
  const cmd = new PutObjectCommand({
    Bucket,
    Key: key,
    ContentType: opts?.contentType ?? "image/webp",
  });
  return getSignedUrl(getClient(), cmd, { expiresIn: opts?.expiresIn ?? 900 });
}

export async function presignDownload(
  key: string,
  opts?: { expiresIn?: number }
): Promise<string> {
  const Bucket = getBucket();
  const cmd = new GetObjectCommand({ Bucket, Key: key });
  const ttl =
    opts?.expiresIn ?? (Number(process.env.ORDER_FILES_LINK_TTL) || 604800);
  return getSignedUrl(getClient(), cmd, { expiresIn: ttl });
}

export async function objectExists(key: string): Promise<boolean> {
  const Bucket = getBucket();
  try {
    await getClient().send(new HeadObjectCommand({ Bucket, Key: key }));
    return true;
  } catch (err: unknown) {
    const e = err as { name?: string; $metadata?: { httpStatusCode?: number } };
    if (
      e?.name === "NotFound" ||
      e?.$metadata?.httpStatusCode === 404
    ) {
      return false;
    }
    throw err;
  }
}

export async function deletePrefix(prefix: string): Promise<void> {
  const Bucket = getBucket();
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
