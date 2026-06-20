import { describe, test, expect, vi, beforeEach } from "vitest";

// Mock @aws-sdk/client-s3 before any imports that use it
vi.mock("@aws-sdk/client-s3", () => {
  const mockSend = vi.fn();

  class MockS3Client {
    send = mockSend;
  }

  class PutObjectCommand {
    input: unknown;
    constructor(input: unknown) {
      this.input = input;
    }
  }

  class GetObjectCommand {
    input: unknown;
    constructor(input: unknown) {
      this.input = input;
    }
  }

  class HeadObjectCommand {
    input: unknown;
    constructor(input: unknown) {
      this.input = input;
    }
  }

  class ListObjectsV2Command {
    input: unknown;
    constructor(input: unknown) {
      this.input = input;
    }
  }

  class DeleteObjectsCommand {
    input: unknown;
    constructor(input: unknown) {
      this.input = input;
    }
  }

  class NotFound extends Error {
    name = "NotFound";
  }

  return {
    S3Client: MockS3Client,
    PutObjectCommand,
    GetObjectCommand,
    HeadObjectCommand,
    ListObjectsV2Command,
    DeleteObjectsCommand,
    NotFound,
  };
});

vi.mock("@aws-sdk/s3-request-presigner", () => ({
  getSignedUrl: vi.fn(async () => "https://signed.example/url"),
}));

// Set env before importing module under test
process.env.AWS_REGION = "us-east-1";
process.env.S3_STICKERS_BUCKET = "test-stickers-bucket";
process.env.ORDER_FILES_LINK_TTL = "86400";

import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import {
  S3Client,
  PutObjectCommand,
  GetObjectCommand,
  HeadObjectCommand,
  ListObjectsV2Command,
  DeleteObjectsCommand,
} from "@aws-sdk/client-s3";
import {
  presignUpload,
  presignDownload,
  objectExists,
  deletePrefix,
} from "./s3";

// Access the mock send through the S3Client instance
// The S3Client mock exposes 'send' as a shared vi.fn on the prototype via constructor
// We need to grab it from the module
function getMockSend() {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return (S3Client as any).prototype
    ? // The mock sets send on the instance; grab from a fresh instance
      // Actually in our mock, mockSend is defined in the factory closure.
      // We need to access it differently.
      null
    : null;
}

// Re-get the send mock: since the mock factory creates mockSend as vi.fn() and
// attaches it as instance.send, we can cast the constructed client
let mockSend: ReturnType<typeof vi.fn>;

beforeEach(() => {
  vi.clearAllMocks();
  // Create a client instance to get the send mock
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const client = new (S3Client as any)();
  mockSend = client.send;
});

describe("presignUpload", () => {
  test("returns a signed URL for a PUT", async () => {
    const url = await presignUpload("u_user1/ord1/stk1.webp");
    expect(url).toBe("https://signed.example/url");
  });

  test("calls getSignedUrl with a PutObjectCommand carrying Bucket, Key, and default ContentType", async () => {
    await presignUpload("u_user1/ord1/stk1.webp");

    expect(getSignedUrl).toHaveBeenCalledTimes(1);
    const [, cmd, opts] = (getSignedUrl as ReturnType<typeof vi.fn>).mock
      .calls[0];
    expect(cmd).toBeInstanceOf(PutObjectCommand);
    expect((cmd as InstanceType<typeof PutObjectCommand>).input).toMatchObject({
      Bucket: "test-stickers-bucket",
      Key: "u_user1/ord1/stk1.webp",
      ContentType: "image/webp",
    });
    expect(opts.expiresIn).toBe(900);
  });

  test("respects custom expiresIn and contentType", async () => {
    await presignUpload("some/key.webp", {
      expiresIn: 300,
      contentType: "image/png",
    });

    const [, cmd, opts] = (getSignedUrl as ReturnType<typeof vi.fn>).mock
      .calls[0];
    expect((cmd as InstanceType<typeof PutObjectCommand>).input).toMatchObject({
      ContentType: "image/png",
    });
    expect(opts.expiresIn).toBe(300);
  });
});

describe("presignDownload", () => {
  test("returns a signed URL for a GET", async () => {
    const url = await presignDownload("u_user1/ord1/stk1.webp");
    expect(url).toBe("https://signed.example/url");
  });

  test("calls getSignedUrl with a GetObjectCommand and TTL from env", async () => {
    await presignDownload("u_user1/ord1/stk1.webp");

    const [, cmd, opts] = (getSignedUrl as ReturnType<typeof vi.fn>).mock
      .calls[0];
    expect(cmd).toBeInstanceOf(GetObjectCommand);
    expect((cmd as InstanceType<typeof GetObjectCommand>).input).toMatchObject({
      Bucket: "test-stickers-bucket",
      Key: "u_user1/ord1/stk1.webp",
    });
    expect(opts.expiresIn).toBe(86400); // from ORDER_FILES_LINK_TTL env
  });

  test("uses default TTL of 604800 when env not set", async () => {
    const saved = process.env.ORDER_FILES_LINK_TTL;
    delete process.env.ORDER_FILES_LINK_TTL;

    await presignDownload("some/key.webp");

    const [, , opts] = (getSignedUrl as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(opts.expiresIn).toBe(604800);

    process.env.ORDER_FILES_LINK_TTL = saved;
  });
});

describe("objectExists", () => {
  test("returns true when HeadObject resolves", async () => {
    mockSend.mockResolvedValueOnce({});
    const result = await objectExists("u_user1/ord1/stk1.webp");
    expect(result).toBe(true);
    expect(mockSend).toHaveBeenCalledTimes(1);
    const cmd = mockSend.mock.calls[0][0];
    expect(cmd).toBeInstanceOf(HeadObjectCommand);
  });

  test("returns false when HeadObject rejects with NotFound name", async () => {
    const err = new Error("Not found");
    err.name = "NotFound";
    mockSend.mockRejectedValueOnce(err);
    const result = await objectExists("missing/key.webp");
    expect(result).toBe(false);
  });

  test("returns false when HeadObject rejects with 404 httpStatusCode", async () => {
    const err = Object.assign(new Error("Not found"), {
      $metadata: { httpStatusCode: 404 },
    });
    mockSend.mockRejectedValueOnce(err);
    const result = await objectExists("missing/key.webp");
    expect(result).toBe(false);
  });

  test("re-throws non-404 errors (does not swallow auth/network errors)", async () => {
    const networkErr = new Error("Network failure");
    networkErr.name = "NetworkError";
    mockSend.mockRejectedValueOnce(networkErr);
    await expect(objectExists("some/key.webp")).rejects.toThrow(
      "Network failure"
    );
  });
});

describe("deletePrefix", () => {
  test("lists objects then deletes them in a single batch", async () => {
    // First call: ListObjectsV2 → 2 objects, no pagination
    mockSend.mockResolvedValueOnce({
      Contents: [{ Key: "prefix/a.webp" }, { Key: "prefix/b.webp" }],
      IsTruncated: false,
    });
    // Second call: DeleteObjects
    mockSend.mockResolvedValueOnce({ Deleted: [] });

    await deletePrefix("prefix/");

    expect(mockSend).toHaveBeenCalledTimes(2);

    const listCmd = mockSend.mock.calls[0][0];
    expect(listCmd).toBeInstanceOf(ListObjectsV2Command);
    expect((listCmd as InstanceType<typeof ListObjectsV2Command>).input).toMatchObject({
      Bucket: "test-stickers-bucket",
      Prefix: "prefix/",
    });

    const deleteCmd = mockSend.mock.calls[1][0];
    expect(deleteCmd).toBeInstanceOf(DeleteObjectsCommand);
    expect(
      (deleteCmd as InstanceType<typeof DeleteObjectsCommand>).input
    ).toMatchObject({
      Bucket: "test-stickers-bucket",
      Delete: {
        Objects: [{ Key: "prefix/a.webp" }, { Key: "prefix/b.webp" }],
      },
    });
  });

  test("is a no-op when the prefix has no objects", async () => {
    mockSend.mockResolvedValueOnce({
      Contents: [],
      IsTruncated: false,
    });

    await deletePrefix("empty-prefix/");

    expect(mockSend).toHaveBeenCalledTimes(1); // only the List call
    const cmd = mockSend.mock.calls[0][0];
    expect(cmd).toBeInstanceOf(ListObjectsV2Command);
  });

  test("is a no-op when Contents is undefined", async () => {
    mockSend.mockResolvedValueOnce({ IsTruncated: false });

    await deletePrefix("empty-prefix/");

    expect(mockSend).toHaveBeenCalledTimes(1);
  });

  test("handles pagination by looping with ContinuationToken", async () => {
    // Call order: list-page1, delete-page1, list-page2, delete-page2
    mockSend
      // list page 1 → truncated
      .mockResolvedValueOnce({
        Contents: [{ Key: "p/a.webp" }],
        IsTruncated: true,
        NextContinuationToken: "token-1",
      })
      // delete page 1 items
      .mockResolvedValueOnce({ Deleted: [] })
      // list page 2 → done
      .mockResolvedValueOnce({
        Contents: [{ Key: "p/b.webp" }],
        IsTruncated: false,
      })
      // delete page 2 items
      .mockResolvedValueOnce({ Deleted: [] });

    await deletePrefix("p/");

    // 2 list calls + 2 delete calls = 4
    expect(mockSend).toHaveBeenCalledTimes(4);

    const listCmd2 = mockSend.mock.calls[2][0];
    expect(listCmd2).toBeInstanceOf(ListObjectsV2Command);
    expect(
      (listCmd2 as InstanceType<typeof ListObjectsV2Command>).input
    ).toMatchObject({ ContinuationToken: "token-1" });
  });
});
